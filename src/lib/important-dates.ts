import "server-only";
import { withSchool } from "./db";

// 27 Nov (Alfonso): Important dates (when to book exams, when the exams are, results) on the parent and student Resources
// page, edited in Admin → Website → Resources; booking deadlines marked "remind" get the Exam booking reminder email.
// The exam partner (name, booking link, partner code) is kept in meet_kv 'exam_partner'. db/131.
export type DateKind = "book" | "exam" | "results" | "other";
export const DATE_KINDS: { id: DateKind; label: string }[] = [{ id: "book", label: "Booking" }, { id: "exam", label: "Exams" }, { id: "results", label: "Results" }, { id: "other", label: "Other" }];
export type ImportantDate = { id: string; title: string; when_text: string | null; starts_on: string | null; ends_on: string | null; details: string | null; link: string | null; kind: DateKind; remind: boolean; published: boolean };
export type ExamPartner = { name: string; booking: string; code: string; note: string };
const PARTNER: ExamPartner = { name: "Tutors & Exams", booking: "https://www.tutorsandexams.uk/apply/", code: "", note: "" };

export async function importantDates(all = false): Promise<ImportantDate[]> {
  return withSchool((q) => q<ImportantDate>(`select id, title, when_text, starts_on::text, ends_on::text, details, link, kind, remind, published from important_dates
    ${all ? "" : "where published"} order by starts_on nulls first, title`)).catch(() => []);
}
export async function examPartner(): Promise<ExamPartner> {
  const v = (await withSchool((q) => q<{ value: Partial<ExamPartner> }>(`select value from meet_kv where key = 'exam_partner'`)).catch(() => []))[0]?.value;
  return { ...PARTNER, ...(v ?? {}) };
}
export async function saveExamPartner(actorId: string, p: ExamPartner): Promise<string | null> {
  if (!p.name.trim()) return "Give the exam partner’s name.";
  if (p.booking.trim() && !/^https:\/\/\S+$/.test(p.booking.trim())) return "The booking link must start with https://";
  const v = { name: p.name.trim().slice(0, 80), booking: p.booking.trim().slice(0, 600), code: p.code.trim().slice(0, 60), note: p.note.trim().slice(0, 300) };
  await withSchool(async (q) => {
    await q(`insert into meet_kv (school_id, key, value) values (current_school(), 'exam_partner', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(v)]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'update', 'exam_partner', $2)`, [actorId, JSON.stringify({ name: v.name, code: v.code ? "set" : "empty" })]);
  });
  return null;
}
export type DateInput = { id?: string; title: string; when_text: string; starts_on: string; ends_on: string; details: string; link: string; kind: string; remind: boolean; published: boolean };
export async function saveImportantDate(actorId: string, d: DateInput): Promise<string | null> {
  const okDate = (s: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (d.title.trim().length < 2) return "Give the date a title.";
  if (!okDate(d.starts_on) || !okDate(d.ends_on)) return "Choose the dates with the date picker.";
  if (d.ends_on && d.starts_on && d.ends_on < d.starts_on) return "The end date is before the start date.";
  if (d.link.trim() && !/^https:\/\/\S+$/.test(d.link.trim())) return "The link must start with https://";
  if (!DATE_KINDS.some((k) => k.id === d.kind)) return "Choose what kind of date it is.";
  if (d.remind && !d.starts_on) return "A reminder needs a date.";
  try {
    return await withSchool(async (q) => {
      const a = [d.title.trim().slice(0, 160), d.when_text.trim().slice(0, 60), d.starts_on || null, d.ends_on || null, d.details.trim().slice(0, 600), d.link.trim(), d.kind, d.remind, d.published];
      if (d.id) { if (!(await q(`update important_dates set title = $2, when_text = nullif($3, ''), starts_on = $4::date, ends_on = $5::date, details = nullif($6, ''), link = nullif($7, ''), kind = $8, remind = $9, published = $10 where id = $1 returning id`, [d.id, ...a])).length) return "That date wasn’t found."; }
      else await q(`insert into important_dates (school_id, title, when_text, starts_on, ends_on, details, link, kind, remind, published) values (current_school(), $1, nullif($2, ''), $3::date, $4::date, nullif($5, ''), nullif($6, ''), $7, $8, $9)`, a);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, $2, 'important_date', $3)`, [actorId, d.id ? "update" : "create", JSON.stringify({ title: d.title, starts_on: d.starts_on })]);
      return null;
    });
  } catch { return "Couldn’t save that date."; }
}
export async function deleteImportantDate(actorId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await withSchool(async (q) => { await q(`delete from important_dates where id = $1`, [id]); await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'important_date', $2, '{}')`, [actorId, id]); });
}
/** "7 February 2027", or the date's own words ("May to June 2027"), or "Now". */
export const whenOf = (d: ImportantDate) => d.when_text || (d.starts_on ? new Date(d.starts_on + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Now");
