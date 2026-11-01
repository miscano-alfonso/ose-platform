import "server-only";
import { withSchool } from "./db";
import { googleAccess, recCanCalendar, MeetError } from "./meet";
import { testMode } from "./test-mode";

// 1:1 Google Meet links (1 Nov). For each booked 1:1 coming up, the recordings account (ose@) makes a Google Calendar
// event with a Meet link and invites the teacher and the child (Google emails them the invitation). The link is saved on
// the booking, so the teacher's My day, and the child's and parent's dashboards, can show it. Cancelled 1:1s have their
// event deleted. While test mode is on, only allowed addresses (admins and the test list) are invited; the event and link
// are still made, and the rest are invited once test mode is off. Because ose@ hosts the Meet, recordings land in its Drive.
const API = () => (process.env.CALENDAR_API_URL || "https://www.googleapis.com/calendar/v3").replace(/\/$/, "");

type Row = { id: string; starts_at: string; minutes: number; student: string; student_email: string | null; teacher: string; teacher_email: string | null;
  subject: string; level: string; focus: string | null; status: string; meet_url: string | null; event: string | null; guests: string[] | null };
export type OneMeetRun = { made: number; updated: number; removed: number; problems: string[]; skipped?: string };

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; j: T & { error?: { message?: string } } }> {
  const r = await fetch(API() + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const j = (r.status === 204 ? {} : await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  return { ok: r.ok, status: r.status, j };
}

/** Make, update or remove the Meet events for 1:1s (only `ids` when given, e.g. just after a booking). */
export async function syncOneMeets(ids?: string[]): Promise<OneMeetRun> {
  const run: OneMeetRun = { made: 0, updated: 0, removed: 0, problems: [] };
  const can = await recCanCalendar().catch(() => "none" as const);
  if (can !== "ok") { run.skipped = can === "reconnect" ? "Reconnect the recordings account (ose@) so it can make calendar events." : "Connect the recordings account (ose@) first."; return run; }
  let token: string;
  try { token = await googleAccess("rec"); } catch (e) { run.skipped = e instanceof MeetError ? e.message : "Couldn’t reach Google."; return run; }
  const tm = await testMode().catch(() => ({ on: true, allow: [] as string[], admins: [] as string[] }));
  const allowed = new Set([...tm.admins, ...tm.allow].map((x) => x.toLowerCase()));
  const may = (e: string | null) => !!e && (!tm.on || allowed.has(e.toLowerCase()));
  const rows = await withSchool((q) => q<Row>(`
    select b.id, b.starts_at::text, b.minutes, b.student_name as student, b.student_email::text, u.name as teacher, u.email::text as teacher_email,
      sj.name as subject, coalesce(l.name, '') as level, b.focus, b.status::text, b.meet_url, b.calendar_event_id as event, b.calendar_guests as guests
    from tutoring_bookings b join teachers t on t.id = b.teacher_id join users u on u.id = t.user_id join subjects sj on sj.id = b.subject_id left join levels l on l.id = b.level_id
    where ($1::uuid[] is null or b.id = any($1::uuid[]))
      and ((b.status = 'booked' and b.starts_at > now() - interval '1 hour' and b.starts_at < now() + interval '60 days')
        or (b.status = 'cancelled' and b.calendar_event_id is not null))
    order by b.starts_at limit 100`, [ids?.length ? ids : null]));
  for (const b of rows) {
    try {
      if (b.status === "cancelled") {   // take the event away (Google tells whoever was invited)
        const r = await call(token, "DELETE", `/calendars/primary/events/${encodeURIComponent(b.event!)}?sendUpdates=${b.guests?.length ? "all" : "none"}`);
        if (r.ok || r.status === 404 || r.status === 410) { await withSchool((q) => q(`update tutoring_bookings set calendar_event_id = null, meet_url = null, calendar_guests = null where id = $1`, [b.id])); run.removed++; }
        else run.problems.push(`${b.student}: Google wouldn’t remove the event (${r.status}).`);
        continue;
      }
      const guests = [b.teacher_email, b.student_email].filter(may).map((e) => e!.toLowerCase());
      const start = new Date(b.starts_at), end = new Date(start.getTime() + b.minutes * 60e3);
      if (!b.event) {
        const body = {
          summary: `1:1 · ${b.student} · ${b.level ? `${b.level} ` : ""}${b.subject}`.trim(),
          description: `1:1 lesson with ${b.teacher}${b.focus ? `\n\nFocus: ${b.focus}` : ""}\n\nJoin with the Google Meet link in this invitation.`,
          start: { dateTime: start.toISOString(), timeZone: "Europe/London" }, end: { dateTime: end.toISOString(), timeZone: "Europe/London" },
          attendees: guests.map((email) => ({ email })), guestsCanInviteOthers: false, guestsCanModify: false,
          conferenceData: { createRequest: { requestId: `one-${b.id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
        };
        const r = await call<{ id?: string; hangoutLink?: string }>(token, "POST", `/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${guests.length ? "all" : "none"}`, body);
        if (!r.ok || !r.j.id) { run.problems.push(`${b.student}: Google wouldn’t make the event (${r.status}${r.j.error?.message ? `: ${r.j.error.message.slice(0, 120)}` : ""}).`); continue; }
        await withSchool((q) => q(`update tutoring_bookings set calendar_event_id = $2, meet_url = $3, calendar_guests = $4 where id = $1`, [b.id, r.j.id, r.j.hangoutLink ?? null, guests]));
        run.made++;
        continue;
      }
      // the link can arrive a moment after the event is made; new guests once test mode allows them
      const add = guests.filter((g) => !(b.guests ?? []).includes(g));
      if (!b.meet_url || add.length) {
        const r = add.length
          ? await call<{ hangoutLink?: string }>(token, "PATCH", `/calendars/primary/events/${encodeURIComponent(b.event)}?conferenceDataVersion=1&sendUpdates=all`, { attendees: [...new Set([...(b.guests ?? []), ...add])].map((email) => ({ email })) })
          : await call<{ hangoutLink?: string }>(token, "GET", `/calendars/primary/events/${encodeURIComponent(b.event)}`);
        if (r.ok) { await withSchool((q) => q(`update tutoring_bookings set meet_url = coalesce($2, meet_url), calendar_guests = $3 where id = $1`, [b.id, r.j.hangoutLink ?? null, [...new Set([...(b.guests ?? []), ...add])]])); run.updated++; }
        else run.problems.push(`${b.student}: Google wouldn’t update the event (${r.status}).`);
      }
    } catch (e) { run.problems.push(`${b.student}: ${(e as Error).message.slice(0, 120)}`); }
  }
  return run;
}

/** For the background jobs: runs at most every 10 minutes. */
export async function oneMeetsBackground() {
  const { googleKv, googleKvSet } = await import("./meet");
  const last = await googleKv<{ at: string; run?: OneMeetRun }>("one_meets").catch(() => null);
  if (last && Date.now() - Date.parse(last.at) < 10 * 60e3) return;
  const run = await syncOneMeets().catch((e) => ({ made: 0, updated: 0, removed: 0, problems: [String((e as Error).message)] }));
  await googleKvSet("one_meets", { at: new Date().toISOString(), run }).catch(() => null);
}
