import "server-only";
import { randomBytes } from "node:crypto";
import { withSchool, runAsSchool, activeSchool } from "./db";
import { siteBase } from "./social";
import { joinPath } from "./checkins";

// OH-SO ED Calendar: each teacher, parent and student gets a private calendar address (an iCalendar feed) to add to
// Google Calendar, Apple Calendar or Outlook. Their lessons, 1:1s and workshops (and, for parents, payment dates)
// then show in their own calendar and keep themselves up to date: cancelled lessons show as cancelled, moved ones move.
// The address is read only. Anyone with it can see the times, so it can be replaced ("Make a new link").

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export type FeedOwner = { kind: "staff" | "parent" | "student"; id: string };

const newToken = () => randomBytes(24).toString("base64url");

/** The owner's calendar address (made the first time it's asked for). */
export async function feedUrl(o: FeedOwner, fresh = false): Promise<{ https: string; webcal: string; google: string }> {
  const [token, base, school] = await Promise.all([
    withSchool(async (q) => {
      if (fresh) await q(`delete from calendar_feeds where owner_kind = $1 and owner_id = $2`, [o.kind, o.id]);
      const r = await q<{ token: string }>(`insert into calendar_feeds (school_id, owner_kind, owner_id, token) values (current_school(), $1, $2, $3)
        on conflict (school_id, owner_kind, owner_id) do update set owner_kind = excluded.owner_kind returning token`, [o.kind, o.id, newToken()]);
      return r[0].token;
    }),
    siteBase().catch(() => ""), activeSchool(),
  ]);
  const site = (process.env.SITE_URL || base || "").replace(/\/$/, "");
  const https = `${site}/cal/${school}/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}

// ---------- the feed ----------
type Ev = { uid: string; start: Date | string; end: Date | string; allDay?: boolean; title: string; desc?: string; url?: string; cancelled?: boolean; location?: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const ymd = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
/** iCalendar lines are folded at 75 bytes. */
function fold(line: string): string {
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function ics(name: string, evs: Ev[]): string {
  const now = utc(new Date());
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OH-SO EdTech//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Europe/London", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of evs) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`);
    if (e.allDay) L.push(`DTSTART;VALUE=DATE:${ymd(e.start as string)}`, `DTEND;VALUE=DATE:${ymd(e.end as string)}`, "TRANSP:TRANSPARENT");
    else L.push(`DTSTART:${utc(e.start as Date)}`, `DTEND:${utc(e.end as Date)}`);
    L.push(`SUMMARY:${esc((e.cancelled ? "Cancelled: " : "") + e.title)}`);
    if (e.desc) L.push(`DESCRIPTION:${esc(e.desc)}`);
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    if (e.url) L.push(`URL:${e.url}`);
    if (e.cancelled) L.push("STATUS:CANCELLED");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

type LessonRow = { id: string; group_id: string; starts: Date; ends: Date; status: string; name: string; code: string | null; teacher: string | null; link: string | null;
  course: string | null; student_id: string | null; child: string | null };
const lessonSql = (who: string) => `
  select e.id, g.id as group_id, (e.lesson_date + sl.starts_at) at time zone sc.timezone as starts, (e.lesson_date + sl.ends_at) at time zone sc.timezone as ends,
    e.status::text, l.name || ' ' || sj.name as name, g.code, u.name as teacher, g.meet_url as link, g.google_course_id as course, st.id as student_id,
    coalesce(st.known_as, st.first_name) as child
  from lesson_events e join lesson_slots sl on sl.id = e.slot_id join course_groups g on g.id = e.group_id join schools sc on sc.id = e.school_id
  join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
  left join teachers t on t.id = coalesce(e.teacher_id, sl.teacher_id, g.teacher_id) left join users u on u.id = t.user_id
  ${who}
  and e.lesson_date between current_date - 60 and current_date + 400 order by 3`;
const enrolled = `join enrolments en on en.group_id = e.group_id and en.status = 'active' and not en.is_taster and coalesce(en.starts_on, en.enrolled_at::date) <= e.lesson_date
  join students st on st.id = en.student_id`;
const classroom = (id: string) => `https://classroom.google.com/c/${Buffer.from(id).toString("base64").replace(/=+$/, "")}`;

async function events(q: Q, o: FeedOwner, site: string): Promise<{ name: string; evs: Ev[] }> {
  const school = (await q<{ name: string }>(`select name from schools where id = current_school()`))[0]?.name ?? "OH-SO ED";
  const evs: Ev[] = [];
  const host = site.replace(/^https?:\/\//, "");
  let teacherId: string | null = null;

  if (o.kind === "staff") {
    const t = (await q<{ id: string }>(`select t.id from teachers t where t.user_id = $1`, [o.id]))[0];
    teacherId = t?.id ?? null;
    if (teacherId) for (const r of await q<LessonRow>(lessonSql(`left join students st on false where coalesce(e.teacher_id, sl.teacher_id, g.teacher_id) = $1`), [teacherId]))
      evs.push({ uid: `lesson-${r.id}@${host}`, start: r.starts, end: r.ends, title: `${r.name}${r.code ? ` (${r.code})` : ""}`, cancelled: r.status === "cancelled",
        location: r.link ?? undefined, url: `${site}/admin/register/${r.id}`,
        desc: [r.link && `Lesson link: ${r.link}`, `Register: ${site}/admin/register/${r.id}`, r.course && `Google Classroom: ${classroom(r.course)}`].filter(Boolean).join("\n") });
  } else {
    const rows = await q<LessonRow>(lessonSql(`${enrolled} where ${o.kind === "student" ? "st.id" : "st.parent_id"} = $1`), [o.id]);
    // a parent with two children in the same class gets one event naming both
    const byLesson = new Map<string, LessonRow[]>();
    for (const r of rows) byLesson.set(r.id, [...(byLesson.get(r.id) ?? []), r]);
    for (const [id, rs] of byLesson) {
      const r = rs[0], kids = [...new Set(rs.map((x) => x.child ?? ""))].filter(Boolean).sort();
      const join = o.kind === "student" && r.student_id ? `${site}${joinPath(r.group_id, r.student_id)}` : null;
      evs.push({ uid: `lesson-${id}-${o.id}@${host}`, start: r.starts, end: r.ends, cancelled: r.status === "cancelled",
        title: o.kind === "parent" ? `${kids.join(", ").replace(/, ([^,]*)$/, " and $1")}: ${r.name}` : r.name, url: join ?? `${site}/${o.kind}`, location: join ?? undefined,
        desc: [r.teacher && `Teacher: ${r.teacher}`, join && `Join the lesson: ${join}`, r.course && `Google Classroom: ${classroom(r.course)}`].filter(Boolean).join("\n") });
    }
  }

  // 1:1s
  const oneWhere = o.kind === "staff" ? "b.teacher_id = $1" : o.kind === "parent" ? "b.parent_id = $1" : "b.student_id = $1";
  if (o.kind !== "staff" || teacherId) for (const b of await q<{ id: string; starts: Date; minutes: number; status: string; student: string; what: string; teacher: string; focus: string | null }>(`
      select b.id, b.starts_at as starts, b.minutes, b.status::text, b.student_name as student, l.name || ' ' || sj.name as what, u.name as teacher, b.focus
      from tutoring_bookings b join levels l on l.id = b.level_id join subjects sj on sj.id = b.subject_id join teachers t on t.id = b.teacher_id join users u on u.id = t.user_id
      where ${oneWhere} and b.status in ('booked', 'completed', 'cancelled') and b.starts_at > now() - interval '60 days'`, [teacherId ?? o.id]))
    evs.push({ uid: `one-${b.id}@${host}`, start: b.starts, end: new Date(new Date(b.starts).getTime() + b.minutes * 60e3), cancelled: b.status === "cancelled",
      title: o.kind === "staff" ? `1:1 with ${b.student} (${b.what})` : `${o.kind === "parent" ? `${b.student.split(" ")[0]}: ` : ""}1:1 ${b.what} with ${b.teacher}`,
      desc: [b.focus && `Help with: ${b.focus}`].filter(Boolean).join("\n") || undefined });

  // workshops
  const ws = o.kind === "staff"
    ? await q<{ id: string; starts: Date; minutes: number; title: string; status: string; who: string | null }>(`select w.id, w.starts_at as starts, w.minutes, w.title, w.status::text, null as who
        from workshops w where w.teacher_id = $1 and w.status <> 'draft' and w.starts_at > now() - interval '60 days'`, [teacherId])
    : await q<{ id: string; starts: Date; minutes: number; title: string; status: string; who: string | null }>(`select w.id || '-' || wb.id as id, w.starts_at as starts, w.minutes, w.title,
          case when wb.status = 'cancelled' then 'cancelled' else w.status::text end as status, wb.student_name as who
        from workshop_bookings wb join workshops w on w.id = wb.workshop_id
        where ${o.kind === "parent" ? "wb.parent_id" : "wb.student_id"} = $1 and wb.status <> 'pending_payment' and w.status <> 'draft' and w.starts_at > now() - interval '60 days'`, [o.id]);
  if (o.kind !== "staff" || teacherId) for (const w of ws)
    evs.push({ uid: `workshop-${w.id}@${host}`, start: w.starts, end: new Date(new Date(w.starts).getTime() + w.minutes * 60e3), cancelled: w.status === "cancelled",
      title: `${o.kind === "parent" && w.who ? `${w.who.split(" ")[0]}: ` : ""}Workshop: ${w.title}` });

  // holidays and the first day of each term, for everyone
  for (const h of await q<{ id: string; name: string; s: string; e: string }>(`select id, name, starts_on::text as s, ends_on::text as e from holidays where ends_on >= current_date - 60 and starts_on <= current_date + 400`))
    evs.push({ uid: `holiday-${h.id}@${host}`, start: h.s, end: nextDay(h.e), allDay: true, title: `${school}: ${h.name}` });
  for (const t of await q<{ id: string; name: string; s: string }>(`select id, name, starts_on::text as s from terms where starts_on between current_date - 60 and current_date + 400`))
    evs.push({ uid: `term-${t.id}@${host}`, start: t.s, end: nextDay(t.s), allDay: true, title: `${school}: ${t.name} starts` });

  // parents: when each term's payment is due
  if (o.kind === "parent")
    for (const p of await q<{ d: string; term: string; amount: number }>(`select i.due_on::text as d, min(t.name) as term, sum(i.amount_pence)::int as amount
        from instalments i join enrolments en on en.id = i.enrolment_id join students st on st.id = en.student_id join terms t on t.id = i.term_id
        where st.parent_id = $1 and i.status in ('scheduled', 'failed') and i.due_on between current_date - 30 and current_date + 400 group by i.due_on`, [o.id]))
      evs.push({ uid: `pay-${o.id}-${p.d}@${host}`, start: p.d, end: nextDay(p.d), allDay: true,
        title: `${school}: ${p.term} payment £${(p.amount / 100).toFixed(2).replace(/\.00$/, "")}`, url: `${site}/parent/payments` });

  return { name: `${school} Calendar`, evs };
}

/** The feed for /cal/<school>/<token>.ics, or null when the address isn't (or is no longer) valid. */
export async function feedFor(school: string, token: string, origin: string): Promise<string | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(school) || !/^[\w-]{20,60}$/.test(token)) return null;
  return runAsSchool(school, () => withSchool(async (q) => {
    const f = (await q<{ owner_kind: FeedOwner["kind"]; owner_id: string }>(`update calendar_feeds set fetched_at = now() where token = $1 returning owner_kind, owner_id`, [token]))[0];
    if (!f) return null;
    const base = (process.env.SITE_URL || (await siteBase(origin).catch(() => "")) || origin).replace(/\/$/, "");
    const { name, evs } = await events(q, { kind: f.owner_kind, id: f.owner_id }, base);
    return ics(name, evs);
  })).catch(() => null);
}
