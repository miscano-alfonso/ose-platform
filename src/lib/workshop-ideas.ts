import "server-only";
import { withSchool } from "./db";

// 27 Nov (Alfonso: "i would like teachers to submit workshop ideas. subject, overview and slides (optional initially)").
// Teachers suggest workshops from 1:1s & workshops (and add slides later); the office reviews them on Workshops, and can
// turn one into a draft workshop (the new-workshop form opens filled in from the idea). db/119.
export type IdeaStatus = "new" | "liked" | "scheduled" | "not_now";
export const IDEA_STATUS: Record<IdeaStatus, [string, string]> = { new: ["New", "info"], liked: ["We like it", "good"], scheduled: ["Workshop set up", "good"], not_now: ["Not for now", "mute"] };
export type Idea = { id: string; title: string; subject: string; overview: string; slides_url: string | null; status: IdeaStatus; office_note: string | null;
  workshop_id: string | null; created_at: string; updated_at: string; teacher: string | null; teacher_id: string };

const clean = (d: { title: string; subject: string; overview: string; slides: string }) => {
  const title = d.title.trim().slice(0, 120), subject = d.subject.trim().slice(0, 80), overview = d.overview.trim().slice(0, 3000), slides = d.slides.trim().slice(0, 500);
  if (title.length < 3) return { error: "Give the workshop a title." };
  if (subject.length < 2) return { error: "Choose or type the subject." };
  if (overview.length < 20) return { error: "Write a short overview: what it covers and who it’s for." };
  if (slides && !/^https?:\/\/\S+$/.test(slides)) return { error: "The slides need to be a link, e.g. to Google Slides." };
  return { title, subject, overview, slides: slides || null };
};

/** A teacher's own ideas, newest first, and the school's subjects (for the subject box). */
export async function myIdeas(userId: string): Promise<{ ideas: Idea[]; subjects: string[] }> {
  return withSchool(async (q) => ({
    ideas: await q<Idea>(`select i.id, i.title, i.subject, i.overview, i.slides_url, i.status, i.office_note, i.workshop_id, i.created_at::text, i.updated_at::text, null as teacher, i.teacher_id
      from workshop_ideas i join teachers t on t.id = i.teacher_id where t.user_id = $1 order by i.created_at desc`, [userId]),
    subjects: (await q<{ name: string }>(`select distinct name from subjects order by name`)).map((r) => r.name),
  })).catch(() => ({ ideas: [], subjects: [] }));
}

/** New idea (no id) or a change to one of the teacher's own (until it's set up as a workshop). */
export async function saveIdea(userId: string, id: string | null, d: { title: string; subject: string; overview: string; slides: string }, actorId = userId): Promise<string | null> {
  const c = clean(d); if ("error" in c) return c.error ?? null;
  return withSchool(async (q) => {
    const r = id
      ? await q<{ id: string }>(`update workshop_ideas i set title = $3, subject = $4, overview = $5, slides_url = $6, updated_at = now()
          from teachers t where i.id = $2 and t.id = i.teacher_id and t.user_id = $1 and i.status <> 'scheduled' returning i.id`, [userId, id, c.title, c.subject, c.overview, c.slides])
      : await q<{ id: string }>(`insert into workshop_ideas (school_id, teacher_id, title, subject, overview, slides_url) select current_school(), t.id, $2, $3, $4, $5 from teachers t where t.user_id = $1 returning id`,
          [userId, c.title, c.subject, c.overview, c.slides]);
    if (!r.length) return id ? "That idea can’t be changed now." : "Only teachers can suggest workshops.";
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'workshop_idea', $3, $4)`,
      [actorId, id ? "update" : "add", r[0].id, JSON.stringify({ title: c.title })]);
    return null;
  });
}
export async function deleteIdea(userId: string, id: string): Promise<void> {
  await withSchool((q) => q(`delete from workshop_ideas i using teachers t where i.id = $2 and t.id = i.teacher_id and t.user_id = $1 and i.status in ('new', 'not_now')`, [userId, id]));
}

/** Admin → Workshops: every idea, new ones first. */
export async function allIdeas(): Promise<Idea[]> {
  return withSchool((q) => q<Idea>(`select i.id, i.title, i.subject, i.overview, i.slides_url, i.status, i.office_note, i.workshop_id, i.created_at::text, i.updated_at::text, u.name as teacher, i.teacher_id
    from workshop_ideas i join teachers t on t.id = i.teacher_id left join users u on u.id = t.user_id
    order by (i.status = 'new') desc, (i.status = 'liked') desc, i.created_at desc limit 200`)).catch(() => []);
}
export async function newIdeasCount(): Promise<number> {
  return (await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from workshop_ideas where status = 'new'`)).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
}
export async function setIdeaStatus(actorId: string, id: string, status: string, note: string): Promise<string | null> {
  if (!(status in IDEA_STATUS)) return "Choose what to do with it.";
  const r = await withSchool(async (q) => {
    const u = await q(`update workshop_ideas set status = $2, office_note = nullif($3, ''), updated_at = now() where id = $1 returning id`, [id, status, note.trim().slice(0, 500)]);
    if (u.length) await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'workshop_idea', $2, $3)`, [actorId, id, JSON.stringify({ status })]);
    return u.length;
  });
  return r ? null : "That idea wasn’t found.";
}
/** The new-workshop form, filled in from an idea: title, subject (matched by name), teacher and the overview. */
export async function ideaForForm(id: string): Promise<{ id: string; title: string; subject_id: string | null; teacher_id: string; summary: string; slides_url: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await withSchool((q) => q<{ id: string; title: string; subject_id: string | null; teacher_id: string; summary: string; slides_url: string | null }>(`select i.id, i.title,
      (select s.id from subjects s where lower(s.name) = lower(i.subject) limit 1) as subject_id, i.teacher_id, left(i.overview, 1000) as summary, i.slides_url
    from workshop_ideas i where i.id = $1`, [id])).catch(() => []))[0] ?? null;
}
/** Once the workshop is saved from an idea, the idea shows as set up (and links to it). */
export async function linkIdea(id: string, workshopId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await withSchool((q) => q(`update workshop_ideas set status = 'scheduled', workshop_id = $2, updated_at = now() where id = $1`, [id, workshopId])).catch(() => null);
}
