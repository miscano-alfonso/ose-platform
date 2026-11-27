import "server-only";
import { withSchool } from "./db";

// Resources (21 Nov): the website's public /resources page of useful resources for learning at home, grouped by subject
// (documentaries, websites, podcasts, books, tips). In the website menu. Managed in Admin → Website → Resources.
export type ResourceKind = "website" | "watch" | "listen" | "book" | "tip";
export const RES_KINDS: { id: ResourceKind; label: string; action: string }[] = [
  { id: "website", label: "Website", action: "Visit the site" }, { id: "watch", label: "Watch", action: "Watch" },
  { id: "listen", label: "Listen", action: "Listen" }, { id: "book", label: "Book", action: "Find the book" }, { id: "tip", label: "Tip", action: "Open" },
];
/** The group that applies to every subject; always shown last. */
export const ALL_SUBJECTS = "All subjects";
export type Resource = { id: string; subject: string; title: string; description: string | null; url: string | null; kind: ResourceKind; sort_order: number; hidden: boolean };

export async function getResources(all = false): Promise<Resource[]> {
  return withSchool((q) => q<Resource>(`select id, subject, title, description, url, kind, sort_order, hidden from site_resources
    ${all ? "" : "where not hidden"} order by sort_order, title`)).catch(() => []);
}

/** Subjects in page order: the school's own subjects in their usual order, then any others A–Z, then "All subjects". */
export function groupBySubject(list: Resource[]): [string, Resource[]][] {
  const ORDER = [/english/i, /math/i, /science|biology|chemistry|physics/i, /geography/i, /history/i, /business/i];
  const rank = (s: string) => s === ALL_SUBJECTS ? 999 : (ORDER.findIndex((re) => re.test(s)) + 1 || 100);
  const subjects = [...new Set(list.map((r) => r.subject))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return subjects.map((s) => [s, list.filter((r) => r.subject === s)]);
}

/** "Physical Geography" → "physical-geography", for /resources#geography links. */
export const subjectAnchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type ResourceInput = { id?: string; subject: string; title: string; description: string; url: string; kind: string; sortOrder: number; hidden: boolean };
export async function saveResource(actorId: string, d: ResourceInput): Promise<string | null> {
  if (!d.subject.trim()) return "Choose which subject it’s for.";
  if (!RES_KINDS.some((k) => k.id === d.kind)) return "Choose what kind of resource it is.";
  if (!d.title.trim()) return "Give it a title.";
  if (d.url.trim() && !/^https:\/\/[^\s]+$/.test(d.url.trim())) return "The link must start with https://";
  if (!d.url.trim() && d.kind !== "tip") return "Add a link, or choose “Tip” for advice with no link.";
  try {
    return await withSchool(async (q) => {
      const args = [d.subject.trim(), d.title.trim(), d.description.trim(), d.url.trim(), d.kind, d.sortOrder, d.hidden];
      let id = d.id;
      if (id) { if (!(await q(`update site_resources set subject = $2, title = $3, description = nullif($4, ''), url = nullif($5, ''), kind = $6, sort_order = $7::int, hidden = $8 where id = $1 returning id`, [id, ...args])).length) return "That resource wasn’t found."; }
      else id = (await q<{ id: string }>(`insert into site_resources (school_id, subject, title, description, url, kind, sort_order, hidden) values (current_school(), $1, $2, nullif($3, ''), nullif($4, ''), $5, $6::int, $7) returning id`, args))[0].id;
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'resource', $3, $4)`,
        [actorId, d.id ? "update" : "create", id, JSON.stringify({ subject: d.subject, title: d.title, url: d.url })]);
      return null;
    });
  } catch { return "Couldn’t save that resource."; }
}
export async function deleteResource(actorId: string, id: string) {
  await withSchool(async (q) => {
    await q(`delete from site_resources where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'resource', $2, '{}')`, [actorId, id]);
  });
}

// ---------- Dashboards (21 Nov): parents and students see the resources for the courses they're on first ----------
/** Groups of subject names that share resources: "English Literature" courses get "English" resources, "Biology" gets "Science". */
const FAMILIES: [string, RegExp][] = [["english", /english/i], ["maths", /math/i], ["science", /science|biology|chemistry|physics/i], ["geography", /geograph/i],
  ["history", /history/i], ["business", /business/i], ["economics", /economic/i], ["computing", /computing|computer|\bict\b/i],
  ["languages", /french|spanish|german|italian|latin|mandarin|^(modern )?languages?$/i], ["religion", /religio|\bre\b/i], ["media", /media/i]];
export const subjectFamily = (s: string) => (FAMILIES.find(([, re]) => re.test(s))?.[0]) ?? s.trim().toLowerCase();

export type CourseRef = { subject: string; level: string; who?: string };
/** Splits the school's resources into the subjects of these courses ("mine", each with the courses it's for) and the rest
 *  ("others"). "All subjects" goes at the end of "mine" only. */
export function resourcesForCourses(list: Resource[], courses: CourseRef[]) {
  const fams = new Set(courses.map((c) => subjectFamily(c.subject)));
  const groups = groupBySubject(list);
  const mine = groups.filter(([s]) => s === ALL_SUBJECTS || fams.has(subjectFamily(s)))
    .map(([s, items]) => ({ subject: s, items, courses: s === ALL_SUBJECTS ? [] : courses.filter((c) => subjectFamily(c.subject) === subjectFamily(s)) }));
  const others = groups.filter(([s]) => s !== ALL_SUBJECTS && !fams.has(subjectFamily(s))).map(([s, items]) => ({ subject: s, items, courses: [] as CourseRef[] }));
  return { mine: mine.length === 1 && mine[0].subject === ALL_SUBJECTS && courses.length === 0 ? [] : mine, others };
}

// ---------- Teachers' suggestions (27 Nov, db/128): a teacher suggests a resource for their subjects; the office adds it
// to the page (Admin → Website → Resources) or says not for now, and the teacher sees which on their Resources page. ----------
export type SuggestionStatus = "new" | "added" | "not_now";
export const SUGG_STATUS: Record<SuggestionStatus, [string, string]> = { new: ["With the office", "info"], added: ["Added to Resources", "good"], not_now: ["Not for now", "mute"] };
export type Suggestion = { id: string; subject: string; title: string; description: string | null; url: string | null; kind: ResourceKind; status: SuggestionStatus;
  office_note: string | null; created_at: string; teacher: string | null };
const SUGG_COLS = `s.id, s.subject, s.title, s.description, s.url, s.kind, s.status, s.office_note, s.created_at::text`;

/** The subjects a teacher teaches this year (their classes and lessons), for "Your subjects" and the suggestion form. */
export async function teacherSubjects(userId: string): Promise<string[]> {
  return (await withSchool((q) => q<{ s: string }>(`select distinct sj.name as s from course_groups g join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
    join teachers t on t.user_id = $1
    where y.ends_on >= current_date and g.status <> 'closed' and (g.teacher_id = t.id or exists (select 1 from lesson_slots ls where ls.group_id = g.id and ls.one_off_on is null and ls.teacher_id = t.id))
    order by 1`, [userId])).catch(() => [])).map((r) => r.s);
}
export async function mySuggestions(userId: string): Promise<Suggestion[]> {
  return withSchool((q) => q<Suggestion>(`select ${SUGG_COLS}, null as teacher from resource_suggestions s join teachers t on t.id = s.teacher_id where t.user_id = $1
    order by s.created_at desc limit 50`, [userId])).catch(() => []);
}
export async function suggestResource(userId: string, d: { subject: string; title: string; description: string; url: string; kind: string }, actorId = userId): Promise<string | null> {
  if (!d.subject.trim()) return "Choose which subject it’s for.";
  if (!RES_KINDS.some((k) => k.id === d.kind)) return "Choose what kind of resource it is.";
  if (d.title.trim().length < 2) return "Give it a title.";
  if (d.url.trim() && !/^https:\/\/[^\s]+$/.test(d.url.trim())) return "The link must start with https://";
  if (!d.url.trim() && d.kind !== "tip") return "Add a link, or choose “Tip” for advice with no link.";
  try {
    return await withSchool(async (q) => {
      const t = (await q<{ id: string }>(`select id from teachers where user_id = $1`, [userId]))[0];
      if (!t) return "Only teachers can suggest resources here.";
      const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from resource_suggestions where teacher_id = $1 and created_at > now() - interval '1 day'`, [t.id]);
      if (n >= 30) return "That’s a lot of suggestions for one day: please send the rest tomorrow.";
      const id = (await q<{ id: string }>(`insert into resource_suggestions (school_id, teacher_id, subject, title, description, url, kind) values (current_school(), $1, $2, $3, nullif($4, ''), nullif($5, ''), $6) returning id`,
        [t.id, d.subject.trim().slice(0, 60), d.title.trim().slice(0, 120), d.description.trim().slice(0, 400), d.url.trim().slice(0, 600), d.kind]))[0].id;
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'create', 'resource_suggestion', $2, $3)`,
        [actorId, id, JSON.stringify({ subject: d.subject, title: d.title })]);
      return null;
    });
  } catch { return "Couldn’t send that suggestion."; }
}
/** A teacher withdraws a suggestion the office hasn't looked at yet. */
export async function withdrawSuggestion(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await withSchool((q) => q(`delete from resource_suggestions s using teachers t where s.id = $1 and s.status = 'new' and t.id = s.teacher_id and t.user_id = $2`, [id, userId])).catch(() => null);
}
/** For the office: new suggestions first, then the last few decided. */
export async function officeSuggestions(): Promise<Suggestion[]> {
  return withSchool((q) => q<Suggestion>(`select ${SUGG_COLS}, u.name as teacher from resource_suggestions s join teachers t on t.id = s.teacher_id join users u on u.id = t.user_id
    where s.status = 'new' or s.updated_at > now() - interval '30 days' order by (s.status = 'new') desc, s.created_at desc limit 60`)).catch(() => []);
}
export async function newSuggestionsCount(): Promise<number> {
  return (await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from resource_suggestions where status = 'new'`)).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
}
/** The office adds a suggestion to the Resources page (with any changes made in the form) or says not for now. */
export async function decideSuggestion(actorId: string, id: string, add: boolean, d: ResourceInput, note: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return "That suggestion wasn’t found.";
  if (add) {
    const err = await saveResource(actorId, { ...d, id: undefined });
    if (err) return err;
  }
  return withSchool(async (q) => {
    const rid = add ? (await q<{ id: string }>(`select id from site_resources where title = $1 and subject = $2 order by created_at desc limit 1`, [d.title.trim(), d.subject.trim()]))[0]?.id ?? null : null;
    const u = await q(`update resource_suggestions set status = $2, office_note = nullif($3, ''), resource_id = $4, updated_at = now() where id = $1 returning id`, [id, add ? "added" : "not_now", note.trim().slice(0, 500), rid]);
    return u.length ? null : "That suggestion wasn’t found.";
  }).catch(() => "Couldn’t save that.");
}
