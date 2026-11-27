import "server-only";
import { withSchool } from "./db";
import { CATALOGUE } from "./menus";

// 27 Nov: one search box for the admin and teacher dashboards (side menu, or Ctrl/⌘ K). Admins find students, families,
// teachers, classes, workshops and pages; teachers find their own students and classes and their pages (never emails).

export type Hit = { title: string; sub?: string; href: string; tag?: string };
export type Group = { key: string; label: string; hits: Hit[]; more?: boolean };

/** Extra words people search for that aren't in a page's menu name. */
const WORDS: Record<string, string> = {
  "/admin/automations": "email automations automatic emails reminders taster emails waiting list emails trial approve previews",
  "/admin/email": "inbox mailbox", "/admin/email-settings": "email settings sender brevo",
  "/admin/enquiries": "waiting list enquiries enquiry interest", "/admin/tasters": "taster trial lesson free",
  "/admin/payments": "direct debit stripe instalments fees invoices", "/admin/test-mode": "test mode beta held emails",
  "/admin/prices": "prices discounts bundles coupons fees", "/admin/term-dates": "terms holidays half term",
  "/admin/reports": "reports progress report comments", "/admin/page-styles": "page styles fonts sizes colours design",
  "/admin/students": "students attendance classroom work missing", "/admin/families": "families parents children",
  "/admin/teachers": "teachers profiles staff access admins invite sign-in link",
  "/admin/lesson-slides": "lesson slides google drive folders library owner",
  "/admin/teacher/marking": "marking hand ins past papers", "/admin/teacher/reports": "reports write comments",
  "/admin/teacher/notifications": "settings notifications email", "/admin/teacher/calendar": "calendar sync settings",
};
const EXTRA: { area: "admin" | "teacher"; label: string; href: string }[] = [
  { area: "admin", label: "Automations: review and approve", href: "/admin/automations/review" },
  { area: "teacher", label: "Notifications (Settings)", href: "/admin/teacher/notifications" },
  { area: "teacher", label: "Calendar sync (Settings)", href: "/admin/teacher/calendar" },
  { area: "teacher", label: "Google Drive (Settings)", href: "/admin/teacher/drive" },
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@.+ ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter(Boolean).slice(0, 6);
const matches = (text: string, ws: string[]) => { const t = norm(text); return ws.every((w) => t.includes(w)); };

function pages(area: "admin" | "teacher", ws: string[], n: number): Hit[] {
  const list = [...CATALOGUE[area].filter((i) => i.href.startsWith("/")), ...EXTRA.filter((e) => e.area === area)];
  const seen = new Set<string>();
  return list.filter((i) => !seen.has(i.href) && seen.add(i.href) && matches(`${i.label} ${WORDS[i.href] ?? ""}`, ws))
    .sort((a, b) => Number(!matches(a.label, ws)) - Number(!matches(b.label, ws))).slice(0, n)
    .map((i) => ({ title: i.label, href: i.href, sub: area === "admin" ? "Page" : "Page", tag: "page" }));
}

/** Search for the admin dashboard. `n` = results per group (the full page shows more). */
export async function adminSearch(q: string, n = 6): Promise<Group[]> {
  const ws = words(q); if (!ws.length || norm(q).length < 2) return [];
  const like = ws.map((w) => `%${w}%`);
  const out = await withSchool(async (db) => {
    // each word must appear somewhere in the row's text
    const all = (expr: string) => `(select bool_and(${expr} ilike qw) from unnest($1::text[]) qw)`;
    const [students, parents, teachers, classes, workshops] = await Promise.all([
      db<{ id: string; name: string; parent: string | null; classes: string | null }>(`select s.id, s.first_name || ' ' || s.last_name || coalesce(' (' || nullif(s.known_as, '') || ')', '') as name,
          p.first_name || ' ' || p.last_name as parent,
          (select string_agg(distinct l.name || ' ' || sj.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
            where e.student_id = s.id and e.status in ('active', 'pending') and not e.is_taster) as classes
        from students s left join parents p on p.id = s.parent_id
        where ${all("concat_ws(' ', s.first_name, s.last_name, s.known_as, s.email, p.first_name, p.last_name)")}
        order by (select count(*) from enrolments e where e.student_id = s.id and e.status in ('active','pending')) = 0, s.first_name, s.last_name limit $2`, [like, n + 1]),
      db<{ id: string; name: string; email: string | null; kids: string | null }>(`select p.id, p.first_name || ' ' || p.last_name as name, p.email::text,
          (select string_agg(coalesce(nullif(s.known_as, ''), s.first_name), ', ' order by s.first_name) from students s where s.parent_id = p.id) as kids
        from parents p where ${all("concat_ws(' ', p.first_name, p.last_name, p.email, p.phone, (select string_agg(s.first_name || ' ' || s.last_name, ' ') from students s where s.parent_id = p.id))")}
        order by p.first_name, p.last_name limit $2`, [like, n + 1]),
      db<{ id: string; name: string; email: string; archived: boolean }>(`select t.id, u.name, u.email::text, t.archived_at is not null as archived
        from teachers t join users u on u.id = t.user_id where ${all("concat_ws(' ', u.name, u.email)")} order by t.archived_at is not null, u.name limit $2`, [like, n + 1]),
      db<{ id: string; name: string; code: string; teacher: string | null; status: string; year: string }>(`select g.id, l.name || ' ' || sj.name as name, g.code, u.name as teacher, g.status::text, y.label as year
        from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
          left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
        where y.ends_on >= current_date and ${all("concat_ws(' ', l.name, sj.name, sj.short_name, g.code, u.name)")} order by y.starts_on, l.sort_order, sj.name limit $2`, [like, n + 1]),
      db<{ id: string; title: string; at: string | null; status: string }>(`select w.id, w.title, to_char(w.starts_at at time zone 'Europe/London', 'Dy DD Mon YYYY') as at, w.status::text
        from workshops w where ${all("w.title")} order by w.starts_at desc nulls last limit $2`, [like, n + 1]),
    ]);
    const cut = <T,>(r: T[]) => ({ list: r.slice(0, n), more: r.length > n });
    const g: Group[] = [];
    const s = cut(students); g.push({ key: "students", label: "Students", more: s.more, hits: s.list.map((r) => ({ title: r.name, sub: [r.classes ?? "No current courses", r.parent && `parent ${r.parent}`].filter(Boolean).join(" · "), href: `/admin/students/${r.id}` })) });
    const p = cut(parents); g.push({ key: "families", label: "Families", more: p.more, hits: p.list.map((r) => ({ title: r.name, sub: [r.kids && `children ${r.kids}`, r.email].filter(Boolean).join(" · "), href: `/admin/families/${r.id}` })) });
    const t = cut(teachers); g.push({ key: "teachers", label: "Teachers", more: t.more, hits: t.list.map((r) => ({ title: r.name, sub: r.archived ? `${r.email} · archived` : r.email, href: `/admin/teachers/${r.id}` })) });
    const c = cut(classes); g.push({ key: "classes", label: "Classes", more: c.more, hits: c.list.map((r) => ({ title: r.name, sub: [r.code, r.teacher ?? "no teacher", r.year, r.status !== "open" ? r.status : ""].filter(Boolean).join(" · "), href: `/admin/classes#g-${r.id}` })) });
    const w = cut(workshops); g.push({ key: "workshops", label: "Workshops", more: w.more, hits: w.list.map((r) => ({ title: r.title, sub: [r.at, r.status].filter(Boolean).join(" · "), href: `/admin/workshops/${r.id}` })) });
    return g;
  });
  return [{ key: "pages", label: "Pages", hits: pages("admin", ws, n) }, ...out].filter((x) => x.hits.length);
}

/** Search for a teacher: only their own students and classes (names, no emails), and their pages. */
export async function teacherSearch(userId: string, q: string, n = 6): Promise<Group[]> {
  const ws = words(q); if (!ws.length || norm(q).length < 2) return [];
  const { myStudents, myClasses } = await import("./teacher-area");
  const [studs, classes] = await Promise.all([myStudents(userId), myClasses(userId)]);
  const st = studs.filter((s) => matches(`${s.name} ${s.known_as ?? ""} ${(s.classes ?? []).map((c) => c.name).join(" ")}`, ws));
  const cl = classes.filter((c) => matches(`${c.level} ${c.subject} ${c.code}`, ws));
  const g: Group[] = [
    { key: "pages", label: "Pages", hits: pages("teacher", ws, n) },
    { key: "students", label: "My students", more: st.length > n, hits: st.slice(0, n).map((s) => ({ title: s.known_as ? `${s.name} (${s.known_as})` : s.name, sub: (s.classes ?? []).map((c) => c.name).join(", "), href: `/admin/teacher/students?q=${encodeURIComponent(s.name)}` })) },
    { key: "classes", label: "My classes", more: cl.length > n, hits: cl.slice(0, n).map((c) => ({ title: `${c.level} ${c.subject}`, sub: `${c.code} · ${c.students} student${c.students === 1 ? "" : "s"}`, href: `/admin/teacher/classes/${c.id}` })) },
  ];
  return g.filter((x) => x.hits.length);
}
