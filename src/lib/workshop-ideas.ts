import "server-only";
import { withSchool } from "./db";

// 27 Nov (Alfonso: "i would like teachers to submit workshop ideas. subject, overview and slides (optional initially)").
// Teachers suggest workshops from 1:1s & workshops (and add slides later); the office reviews them on Workshops, and can
// turn one into a draft workshop (the new-workshop form opens filled in from the idea). db/119.
export type IdeaStatus = "new" | "liked" | "scheduled" | "not_now";
export const IDEA_STATUS: Record<IdeaStatus, [string, string]> = { new: ["New", "info"], liked: ["We like it", "good"], scheduled: ["Workshop set up", "good"], not_now: ["Not for now", "mute"] };
export type IdeaDate = { d: string; t: string };
export type Idea = { id: string; title: string; subject: string; overview: string; slides_url: string | null; status: IdeaStatus; office_note: string | null;
  workshop_id: string | null; created_at: string; updated_at: string; teacher: string | null; teacher_id: string; level_id: string | null; level: string | null; minutes: number; dates: IdeaDate[] };
/** One thing happening at a suggested time: the teacher's own lesson / 1:1 / workshop (they can't do both), or a lesson or
 *  workshop for students the idea is aimed at (they couldn't come). */
export type Clash = { own: boolean; what: string; who: string | null; at: string; students: number | null };

type IdeaInput = { title: string; subject: string; overview: string; slides: string; level: string; minutes: number; dates: IdeaDate[] };
const okDates = (ds: IdeaDate[]) => ds.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && /^\d{2}:\d{2}$/.test(x.t)).slice(0, 3);
const clean = (d: IdeaInput) => {
  const title = d.title.trim().slice(0, 120), subject = d.subject.trim().slice(0, 80), overview = d.overview.trim().slice(0, 3000), slides = d.slides.trim().slice(0, 500);
  if (title.length < 3) return { error: "Give the workshop a title." };
  if (subject.length < 2) return { error: "Choose or type the subject." };
  if (overview.length < 20) return { error: "Write a short overview: what it covers and who it’s for." };
  if (slides && !/^https?:\/\/\S+$/.test(slides)) return { error: "The slides need to be a link, e.g. to Google Slides." };
  const dates = okDates(d.dates), today = new Date().toISOString().slice(0, 10);
  if (dates.some((x) => x.d < today)) return { error: "Suggested dates need to be in the future." };
  return { title, subject, overview, slides: slides || null, level: /^[0-9a-f-]{36}$/.test(d.level) ? d.level : null, minutes: Math.max(15, Math.min(240, Math.round(d.minutes) || 60)), dates };
};

/** A teacher's own ideas, newest first, and the school's subjects (for the subject box). */
export async function myIdeas(userId: string): Promise<{ ideas: Idea[]; subjects: string[]; levels: { id: string; name: string }[] }> {
  return withSchool(async (q) => ({
    ideas: await q<Idea>(`select i.id, i.title, i.subject, i.overview, i.slides_url, i.status, i.office_note, i.workshop_id, i.created_at::text, i.updated_at::text, null as teacher, i.teacher_id, i.level_id, lv.name as level, i.minutes, i.dates
      from workshop_ideas i join teachers t on t.id = i.teacher_id left join levels lv on lv.id = i.level_id where t.user_id = $1 order by i.created_at desc`, [userId]),
    subjects: (await q<{ name: string }>(`select distinct name from subjects order by name`)).map((r) => r.name),
    levels: await q<{ id: string; name: string }>(`select id, name from levels order by sort_order, name`),
  })).catch(() => ({ ideas: [], subjects: [], levels: [] }));
}

/** New idea (no id) or a change to one of the teacher's own (until it's set up as a workshop). */
export async function saveIdea(userId: string, id: string | null, d: IdeaInput, actorId = userId): Promise<string | null> {
  const c = clean(d); if ("error" in c) return c.error ?? null;
  return withSchool(async (q) => {
    const r = id
      ? await q<{ id: string }>(`update workshop_ideas i set title = $3, subject = $4, overview = $5, slides_url = $6, level_id = $7, minutes = $8, dates = $9::jsonb, updated_at = now()
          from teachers t where i.id = $2 and t.id = i.teacher_id and t.user_id = $1 and i.status <> 'scheduled' returning i.id`, [userId, id, c.title, c.subject, c.overview, c.slides, c.level, c.minutes, JSON.stringify(c.dates)])
      : await q<{ id: string }>(`insert into workshop_ideas (school_id, teacher_id, title, subject, overview, slides_url, level_id, minutes, dates) select current_school(), t.id, $2, $3, $4, $5, $6, $7, $8::jsonb from teachers t where t.user_id = $1 returning id`,
          [userId, c.title, c.subject, c.overview, c.slides, c.level, c.minutes, JSON.stringify(c.dates)]);
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
  return withSchool((q) => q<Idea>(`select i.id, i.title, i.subject, i.overview, i.slides_url, i.status, i.office_note, i.workshop_id, i.created_at::text, i.updated_at::text, u.name as teacher, i.teacher_id, i.level_id, lv.name as level, i.minutes, i.dates
    from workshop_ideas i join teachers t on t.id = i.teacher_id left join users u on u.id = t.user_id left join levels lv on lv.id = i.level_id
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
export async function ideaForForm(id: string): Promise<{ id: string; title: string; subject_id: string | null; teacher_id: string; summary: string; slides_url: string | null; level_id: string | null; minutes: number } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await withSchool((q) => q<{ id: string; title: string; subject_id: string | null; teacher_id: string; summary: string; slides_url: string | null; level_id: string | null; minutes: number }>(`select i.id, i.title, i.level_id, i.minutes,
      (select s.id from subjects s where lower(s.name) = lower(i.subject) limit 1) as subject_id, i.teacher_id, left(i.overview, 1000) as summary, i.slides_url
    from workshop_ideas i where i.id = $1`, [id])).catch(() => []))[0] ?? null;
}
/** Once the workshop is saved from an idea, the idea shows as set up (and links to it). */
export async function linkIdea(id: string, workshopId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await withSchool((q) => q(`update workshop_ideas set status = 'scheduled', workshop_id = $2, updated_at = now() where id = $1`, [id, workshopId])).catch(() => null);
}

/** 27 Nov (Alfonso): what a suggested date clashes with: the teacher's own lessons, 1:1s and workshops (they can't do
 *  both), and lessons and workshops for the students the idea is aimed at (its level; any level = every lesson), who
 *  then couldn't come. A warning only: the office can still set the workshop up. Times are London times. */
export async function dateClashes(teacherId: string | null, levelId: string | null, minutes: number, d: IdeaDate): Promise<Clash[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.d) || !/^\d{2}:\d{2}$/.test(d.t)) return [];
  const m = Math.max(15, Math.min(240, Math.round(minutes) || 60)), lv = levelId && /^[0-9a-f-]{36}$/.test(levelId) ? levelId : null, me = teacherId && /^[0-9a-f-]{36}$/.test(teacherId) ? teacherId : null;
  return withSchool((q) => q<Clash>(`
    with w as (select ($1::date + $2::time) as s, ($1::date + $2::time) + make_interval(mins => $3) as e)
    select coalesce(ev.teacher_id = $4, false) as own, l.name || ' ' || coalesce(sj.short_name, sj.name) as what, u.name as who,
      to_char(sl.starts_at, 'HH24:MI') || '–' || to_char(sl.ends_at, 'HH24:MI') as at,
      (select count(*)::int from enrolments x where x.group_id = g.id and x.status in ('active', 'pending') and not x.is_taster) as students
    from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = ev.teacher_id left join users u on u.id = t.user_id, w
    where ev.lesson_date = $1::date and ev.status <> 'cancelled' and (ev.lesson_date + sl.starts_at, ev.lesson_date + sl.ends_at) overlaps (w.s, w.e)
      and (ev.teacher_id = $4 or $5::uuid is null or g.level_id = $5)
    union all
    select coalesce(ws.teacher_id = $4, false), 'Workshop: ' || ws.title, u.name,
      to_char(lower(ws.during) at time zone 'Europe/London', 'HH24:MI') || '–' || to_char(upper(ws.during) at time zone 'Europe/London', 'HH24:MI'), null
    from workshops ws left join teachers t on t.id = ws.teacher_id left join users u on u.id = t.user_id, w
    where ws.status in ('draft', 'published') and ws.during && tstzrange(w.s at time zone 'Europe/London', w.e at time zone 'Europe/London')
      and (ws.teacher_id = $4 or $5::uuid is null or ws.level_id is null or ws.level_id = $5)
    union all
    select true, '1:1 with ' || split_part(coalesce(b.student_name, 'a student'), ' ', 1), null,
      to_char(lower(b.during) at time zone 'Europe/London', 'HH24:MI') || '–' || to_char(upper(b.during) at time zone 'Europe/London', 'HH24:MI'), null
    from tutoring_bookings b, w
    where b.teacher_id = $4 and b.status = 'booked' and b.during && tstzrange(w.s at time zone 'Europe/London', w.e at time zone 'Europe/London')
    order by 1 desc, 4`, [d.d, d.t, m, me, lv])).catch((e) => { console.error("idea clashes", e); return []; });
}
/** Clashes for each of an idea's dates (for the teacher's list and the office's). */
export async function ideaClashes(i: Pick<Idea, "teacher_id" | "level_id" | "minutes" | "dates">): Promise<Clash[][]> {
  return Promise.all((i.dates ?? []).map((d) => dateClashes(i.teacher_id, i.level_id, i.minutes, d)));
}
/** In words, for a warning line. */
export const clashText = (c: Clash, me = "You’re") => c.own ? `${me} teaching then: ${c.what} ${c.at}` : `${c.what.startsWith("Workshop") ? "" : "Lesson at this level: "}${c.what}${c.who ? ` (${c.who})` : ""} ${c.at}${c.students ? ` · ${c.students} student${c.students === 1 ? "" : "s"} couldn’t come` : ""}`;
export async function teacherIdOf(userId: string): Promise<string | null> {
  return (await withSchool((q) => q<{ id: string }>(`select id from teachers where user_id = $1`, [userId])).catch(() => []))[0]?.id ?? null;
}
