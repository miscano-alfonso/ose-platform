import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { withSchool } from "./db";

// Admin → Visitors (26 Nov, db/097): who has looked at the /newdashboard introduction pages and who uses the dashboards.
export const VID_COOKIE = "ose_vid";
export type Kind = "teacher" | "parent" | "student";
const okVid = (v: string | undefined) => !!v && /^[A-Za-z0-9_-]{16,40}$/.test(v);

/** /newdashboard/visit: one view of an introduction page, from this browser (made an id the first time). */
export async function logPresentationView(page: Kind): Promise<void> {
  const jar = await cookies();
  let vid = jar.get(VID_COOKIE)?.value;
  if (!okVid(vid)) {
    vid = randomBytes(16).toString("base64url");
    jar.set(VID_COOKIE, vid, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 86400 });
  }
  // 27 Nov: the kind of device and browser, and whether it's someone from the school (signed in to the admin)
  const staff = await import("./auth").then((m) => m.currentStaff()).then((x) => !!x).catch(() => false);
  const device = deviceOf((await headers()).get("user-agent") ?? "");
  await withSchool((q) => q(`insert into nd_page_views (school_id, vid, page, device, staff) values (current_school(), $1, $2, $3, $4)`, [vid, page, device, staff])).catch(() => null);
  // a parent or student already signed in on this browser: we know who it is
  const { currentFamily } = await import("./family-auth");
  const f = await currentFamily().catch(() => null);
  if (f && !f.viewer) await link(vid!, f.kind, f.id);
}

/** "iPhone · Safari", "Mac · Chrome", "Windows · Edge"…: from the browser's description, nothing more. */
export function deviceOf(ua: string): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet") : /CrOS/.test(ua) ? "Chromebook"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : /bot|crawl|spider|preview|fetch/i.test(ua) ? "a link preview or bot" : "another browser";
  return `${os} · ${br}`;
}
async function link(vid: string, kind: Kind, personId: string) {
  await withSchool((q) => q(`insert into nd_visitor_people (school_id, vid, kind, person_id) values (current_school(), $1, $2, $3) on conflict do nothing`, [vid, kind, personId])).catch(() => null);
}

/** Every dashboard page a teacher, parent or student opens as themselves: counts the day, and ties this browser's
 *  introduction-page visits to them. */
export async function logDashboard(kind: Kind, personId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(personId)) return;
  const vid = (await cookies()).get(VID_COOKIE)?.value;
  await withSchool((q) => q(`insert into dashboard_days (school_id, kind, person_id, day) values (current_school(), $1, $2, (now() at time zone 'Europe/London')::date)
    on conflict (school_id, kind, person_id, day) do update set last_at = now(), hits = dashboard_days.hits + 1`, [kind, personId])).catch(() => null);
  if (okVid(vid)) await link(vid!, kind, personId);
}

export type PersonRow = { id: string; name: string; detail: string; pages: string[] | null; seen_first: string | null; seen_last: string | null;
  dash_first: string | null; dash_last: string | null; days: number; invited?: boolean; has_pw?: boolean };
export type VisitorStats = { teachers: PersonRow[]; parents: PersonRow[]; students: PersonRow[];
  views: { page: Kind; views: number; browsers: number; unknown: number }[]; views7: number; log: VisitRow[] };
/** 27 Nov: one row per introduction-page visit, newest first. browser: a number for each browser (Browser 1, 2…). */
export type VisitRow = { at: string; page: Kind; browser: number; device: string | null; staff: boolean; who: string | null; whoKind: Kind | null; visits: number };

const PRES = (kind: Kind, id: string) => `(select array_agg(distinct nv.page order by nv.page) from nd_visitor_people np join nd_page_views nv on nv.vid = np.vid where np.kind = '${kind}' and np.person_id = ${id}) as pages,
  (select min(nv.at)::text from nd_visitor_people np join nd_page_views nv on nv.vid = np.vid where np.kind = '${kind}' and np.person_id = ${id}) as seen_first,
  (select max(nv.at)::text from nd_visitor_people np join nd_page_views nv on nv.vid = np.vid where np.kind = '${kind}' and np.person_id = ${id}) as seen_last,
  (select min(dd.first_at)::text from dashboard_days dd where dd.kind = '${kind}' and dd.person_id = ${id}) as dash_first,
  (select max(dd.last_at)::text from dashboard_days dd where dd.kind = '${kind}' and dd.person_id = ${id}) as dash_last,
  (select count(*)::int from dashboard_days dd where dd.kind = '${kind}' and dd.person_id = ${id}) as days`;
const CURRENT = `e.status in ('active', 'pending') and not e.is_taster and exists (select 1 from course_groups g join academic_years y on y.id = g.academic_year_id where g.id = e.group_id and y.ends_on >= current_date)`;

export async function visitorStats(): Promise<VisitorStats> {
  return withSchool(async (q) => {
    const teachers = await q<PersonRow>(`select u.id, u.name, coalesce((select string_agg(distinct l.name || ' ' || sj.name, ', ') from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
          join academic_years y on y.id = g.academic_year_id where g.teacher_id = t.id and y.ends_on >= current_date and g.status <> 'hidden'), 'No classes') as detail,
        ${PRES("teacher", "u.id")}, exists (select 1 from staff_invites i where lower(i.email::text) = lower(u.email::text)) as invited, u.password_hash is not null as has_pw
      from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null and u.role = 'teacher' order by u.name`);
    const parents = await q<PersonRow>(`select p.id, p.first_name || ' ' || p.last_name as name,
        (select string_agg(s.first_name, ', ' order by s.first_name) from students s where s.parent_id = p.id) as detail, ${PRES("parent", "p.id")}
      from parents p where exists (select 1 from students s join enrolments e on e.student_id = s.id where s.parent_id = p.id and ${CURRENT})
        or exists (select 1 from dashboard_days d where d.kind = 'parent' and d.person_id = p.id) or exists (select 1 from nd_visitor_people n where n.kind = 'parent' and n.person_id = p.id)
      order by p.last_name, p.first_name`);
    const students = await q<PersonRow>(`select s.id, s.first_name || ' ' || s.last_name as name,
        coalesce((select string_agg(distinct l.name || ' ' || sj.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id
          join subjects sj on sj.id = g.subject_id where e.student_id = s.id and ${CURRENT}), '') as detail, ${PRES("student", "s.id")}
      from students s where exists (select 1 from enrolments e where e.student_id = s.id and ${CURRENT})
        or exists (select 1 from dashboard_days d where d.kind = 'student' and d.person_id = s.id) or exists (select 1 from nd_visitor_people n where n.kind = 'student' and n.person_id = s.id)
      order by s.last_name, s.first_name`);
    const views = await q<{ page: Kind; views: number; browsers: number; unknown: number }>(`select page, count(*)::int as views, count(distinct vid)::int as browsers,
        count(distinct vid) filter (where not exists (select 1 from nd_visitor_people p where p.vid = v.vid))::int as unknown
      from nd_page_views v group by page`);
    const [w] = await q<{ n: number }>(`select count(*)::int as n from nd_page_views where at > now() - interval '7 days'`);
    const log = await q<VisitRow>(`with b as (select vid, row_number() over (order by min(at))::int as n, count(*)::int as visits from nd_page_views group by vid)
      select v.at::text, v.page, b.n as browser, v.device, v.staff, b.visits,
        (select coalesce((select u.name from teachers t join users u on u.id = t.user_id where np.kind = 'teacher' and t.user_id = np.person_id),
            (select p.first_name || ' ' || p.last_name from parents p where np.kind = 'parent' and p.id = np.person_id),
            (select s.first_name || ' ' || s.last_name from students s where np.kind = 'student' and s.id = np.person_id))
          from nd_visitor_people np where np.vid = v.vid order by np.kind limit 1) as who,
        (select np.kind from nd_visitor_people np where np.vid = v.vid order by np.kind limit 1) as "whoKind"
      from nd_page_views v join b on b.vid = v.vid order by v.at desc limit 300`).catch(() => [] as VisitRow[]);
    return { teachers, parents, students, views, views7: w?.n ?? 0, log };
  });
}
