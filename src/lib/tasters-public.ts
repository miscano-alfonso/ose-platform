import "server-only";
import { withSchool, siteInfo } from "./db";

// The website's taster page: families pick one or more classes and a lesson date for each, give the child's
// Google account, and are booked straight in (same rules as the office's bookings: open classes, upcoming lessons,
// a set number of taster places per lesson, one taster per class per child).
// The child is invited to each class's Google Classroom straight away and taken out 3 days after the lesson.

export const TASTER_ACCESS_DAYS = 3;
export const MAX_TASTERS = 4;

export type TasterOption = { id: string; code: string; level: string; subject: string; colour: string; teacher: string | null;
  lessons: { id: string; date: string; starts: string; ends: string; places: number }[] };

export async function tasterOptions(days = 35): Promise<TasterOption[]> {
  return withSchool(async (q) => {
    const groups = await q<Omit<TasterOption, "lessons">>(`select g.id, g.code, l.name as level, sj.name as subject, coalesce(sj.colour,'#8494c2') as colour,
        (select u.name from lesson_slots s join teachers t on t.id = s.teacher_id join users u on u.id = t.user_id where s.group_id = g.id order by s.weekday limit 1) as teacher
      from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where g.status in ('open','priority') and g.academic_year_id in (select id from academic_years where ends_on >= current_date)
      order by l.sort_order, sj.name, g.code`);
    const out: TasterOption[] = [];
    for (const g of groups) {
      const lessons = await q<TasterOption["lessons"][number]>(`select lesson_event_id as id, lesson_date::text as date, to_char(starts_at,'HH24:MI') as starts, to_char(ends_at,'HH24:MI') as ends, places_left as places
        from taster_lessons($1, $2) where places_left > 0`, [g.id, days]);
      if (lessons.length) out.push({ ...g, lessons });
    }
    return out;
  });
}

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export type TasterForm = { parentFirst: string; parentLast: string; parentEmail: string; childName: string; childEmail: string; message: string | null; lessons: string[] };

/** Books the tasters, emails the family and sends the Classroom invitations. Returns an error message, or null. */
export async function bookTastersFromWebsite(f: TasterForm): Promise<string | null> {
  if (!f.lessons.length) return "Choose at least one lesson to try.";
  if (f.lessons.length > MAX_TASTERS) return `You can book up to ${MAX_TASTERS} tasters at a time.`;
  let requestId = "";
  try {
    await withSchool(async (q) => {
      // a light brake on repeated sign-ups from one address
      const recent = (await q<{ n: number }>(`select count(*)::int as n from taster_requests where parent_email = $1::citext and created_at > now() - interval '1 day'`, [f.parentEmail]))[0].n;
      if (recent >= 3) throw new Error("too many");
      const r = (await q<{ id: string }>(`insert into taster_requests (school_id, child_name, child_email, parent_first_name, parent_last_name, parent_email, message, parent_id, source)
        values (current_school(), $1, $2, $3, $4, $5, $6, (select id from parents where email = $5::citext), 'website') returning id`,
        [f.childName, f.childEmail, f.parentFirst, f.parentLast, f.parentEmail, f.message]))[0];
      requestId = r.id;
      for (const id of f.lessons) await q(`insert into taster_bookings (school_id, request_id, lesson_event_id) values (current_school(), $1, $2)`, [r.id, id]);
    });
  } catch (e) {
    const m = (e as { message?: string }).message ?? "";
    if (m === "too many") return "We’ve already had a few taster requests from this email today. Please contact us and we’ll sort it out.";
    if (/already had a taster/.test(m)) return `${f.childName} has already had a taster for one of these classes. Choose a different class, or contact us.`;
    if (/no taster places/.test(m)) return "Someone has just taken the last taster place in one of those lessons. Please pick another date.";
    if (/upcoming lessons/.test(m)) return "One of those lessons is no longer available. Please pick another date.";
    return "We couldn’t book that just now. Please try again, or contact us.";
  }
  // the family's confirmation, then the Classroom invitations (both best-effort: the booking stands either way)
  await confirmTasters(requestId).catch((e) => console.error("taster email", e));
  const { inviteTasters } = await import("./classroom-invites");
  await inviteTasters(requestId).catch((e) => console.error("taster invites", e));
  return null;
}

async function confirmTasters(requestId: string) {
  const site = await siteInfo();
  const rows = await withSchool((q) => q<{ child: string; child_email: string; parent: string; parent_email: string; date: string; starts: string; ends: string; cls: string; teacher: string | null; meet: string | null }>(`
    select r.child_name as child, r.child_email::text, r.parent_first_name as parent, r.parent_email::text, ev.lesson_date::text as date,
      to_char(sl.starts_at,'HH24:MI') as starts, to_char(sl.ends_at,'HH24:MI') as ends, l.name || ' ' || sj.name as cls, u.name as teacher, g.meet_url as meet
    from taster_bookings b join taster_requests r on r.id = b.request_id join lesson_events ev on ev.id = b.lesson_event_id join lesson_slots sl on sl.id = ev.slot_id
    join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    left join teachers t on t.id = coalesce(ev.teacher_id, sl.teacher_id) left join users u on u.id = t.user_id
    where b.request_id = $1 order by ev.lesson_date, sl.starts_at`, [requestId]));
  if (!rows.length) return;
  const r = rows[0];
  const lessons = rows.map((x) => `<tr><td style="padding:10px 12px;border-top:1px solid #e7e9f3"><b>${esc(x.cls)}</b><br>${esc(longDay(x.date))}, ${x.starts}–${x.ends}${x.teacher ? `<br>with ${esc(x.teacher)}` : ""}</td>
    <td style="padding:10px 12px;border-top:1px solid #e7e9f3;white-space:nowrap">Classroom access until<br><b>${esc(longDay(addDays(x.date, TASTER_ACCESS_DAYS)))}</b></td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1f3d;max-width:600px">
    <p>Hello ${esc(r.parent)},</p>
    <p>Thank you for booking ${rows.length === 1 ? "a free taster lesson" : `${rows.length} free taster lessons`} for <b>${esc(r.child)}</b> at ${esc(site.name)}. Here’s what’s booked:</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e7e9f3;border-radius:8px">${lessons}</table>
    <p style="margin-top:18px"><b>Before the lesson:</b> ${esc(r.child)} will receive a Google Classroom invitation for each class at <b>${esc(r.child_email)}</b>. Please open it and press <b>Join</b>. Lessons run in Google Meet, and the link is in the class’s Classroom.</p>
    <p><b>How long the access lasts:</b> ${esc(r.child)} can stay in each Classroom until ${TASTER_ACCESS_DAYS} days after the taster lesson, to look round the class’s work and resources. After that we’ll take ${esc(r.child)} out automatically, unless you’ve booked the course, in which case ${esc(r.child)} simply stays in the class.</p>
    <p>If anything changes, just reply to this email.</p>
    <p>See you soon,<br>${esc(site.name)}</p></div>`;
  const { sendHtml } = await import("./email");
  await sendHtml(`${r.child}’s taster ${rows.length === 1 ? "lesson is" : "lessons are"} booked`, html, [r.parent_email, r.child_email].filter((x, i, a) => x && a.indexOf(x) === i), "taster-booked");
}
