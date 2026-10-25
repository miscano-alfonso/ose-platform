import "server-only";
import { withSchool } from "./db";

// Termly reports: one entry per student per class. Teachers write them; an admin approves and publishes.
const YEAR_SQL = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;
export type Cycle = { id: string; name: string; term: string | null; marks_from: string; marks_to: string; comments_due: string; publish_on: string; status: string;
  total: number; todo: number; draft: number; submitted: number; returned: number; approved: number };
export type ClassProgress = { group_id: string; code: string; name: string; teacher: string | null; total: number; done: number; submitted: number; approved: number };
export type ReviewEntry = { id: string; student: string; class: string; teacher: string | null; progress: number | null; avg_pct: string | null; effort: number | null;
  working_grade: number | null; predicted_grade: number | null; comment: string | null; status: string; review_note: string | null };

const counts = `count(e.id)::int as total, count(e.id) filter (where e.status = 'todo')::int as todo, count(e.id) filter (where e.status = 'draft')::int as draft,
  count(e.id) filter (where e.status = 'submitted')::int as submitted, count(e.id) filter (where e.status = 'returned')::int as returned,
  count(e.id) filter (where e.status = 'approved')::int as approved`;

export async function getCycles(): Promise<{ cycles: Cycle[]; terms: { id: string; name: string; starts_on: string; ends_on: string }[] }> {
  return withSchool(async (q) => ({
    cycles: await q<Cycle>(`select c.id, c.name, t.name as term, c.marks_from::text, c.marks_to::text, c.comments_due::text, c.publish_on::text, c.status::text, ${counts}
      from report_cycles c left join terms t on t.id = c.term_id left join report_entries e on e.cycle_id = c.id
      where c.academic_year_id = ${YEAR_SQL} group by c.id, t.name order by c.publish_on`),
    terms: await q(`select id, name, starts_on::text, ends_on::text from terms where academic_year_id = ${YEAR_SQL} order by number`),
  }));
}

export async function createCycle(actorId: string, d: { name: string; termId: string | null; from: string; to: string; due: string; publish: string }): Promise<string | null> {
  try {
    await withSchool(async (q) => {
      await q(`insert into report_cycles (school_id, academic_year_id, term_id, name, marks_from, marks_to, comments_due, publish_on)
        values (current_school(), ${YEAR_SQL}, $1::uuid, $2, $3::date, $4::date, $5::date, $6::date)`, [d.termId, d.name, d.from, d.to, d.due, d.publish]);
      await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'create', 'report_cycle', $2)`, [actorId, JSON.stringify(d)]);
    });
    return null;
  } catch (e) { return (e as { code?: string }).code === "23505" ? "There’s already a report with that name this year." : "Couldn’t create that report."; }
}

/** One entry for every student in every class (taught classes only); safe to run again for late joiners. */
export async function createEntries(actorId: string, cycleId: string): Promise<number> {
  return withSchool(async (q) => {
    const r = await q(`insert into report_entries (school_id, cycle_id, student_id, group_id, teacher_id)
      select current_school(), c.id, e.student_id, g.id, g.teacher_id from report_cycles c
      join course_groups g on g.academic_year_id = c.academic_year_id join enrolments e on e.group_id = g.id
      where c.id = $1 and e.status = 'active' and not e.is_taster on conflict (cycle_id, student_id, group_id) do nothing returning id`, [cycleId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'entries', 'report_cycle', $2, $3)`,
      [actorId, cycleId, JSON.stringify({ added: r.length })]);
    return r.length;
  });
}

export async function getCycle(cycleId: string) {
  return withSchool(async (q) => {
    const cycle = (await q<Cycle>(`select c.id, c.name, null as term, c.marks_from::text, c.marks_to::text, c.comments_due::text, c.publish_on::text, c.status::text, ${counts}
      from report_cycles c left join report_entries e on e.cycle_id = c.id where c.id = $1 group by c.id`, [cycleId]))[0];
    if (!cycle) return null;
    const classes = await q<ClassProgress>(`select g.id as group_id, g.code, l.name || ' ' || sj.name as name, u.name as teacher, count(e.id)::int as total,
        count(e.id) filter (where e.status in ('submitted','approved'))::int as done, count(e.id) filter (where e.status = 'submitted')::int as submitted,
        count(e.id) filter (where e.status = 'approved')::int as approved
      from report_entries e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id where e.cycle_id = $1
      group by g.id, l.sort_order, l.name, sj.name, u.name order by l.sort_order, sj.name`, [cycleId]);
    const review = await q<ReviewEntry>(`select e.id, s.first_name || ' ' || s.last_name as student, rl.level || ' ' || rl.subject as class, u.name as teacher,
        rl.progress, rl.avg_pct::text, e.effort, e.working_grade, e.predicted_grade, e.comment, e.status::text, e.review_note
      from report_entries e join report_lines rl on rl.id = e.id join students s on s.id = e.student_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.cycle_id = $1 and e.status = 'submitted' order by rl.level, rl.subject, s.first_name`, [cycleId]);
    return { cycle, classes, review };
  });
}

export async function reviewEntry(actorId: string, id: string, approve: boolean, note: string | null): Promise<void> {
  await withSchool(async (q) => {
    if (approve) await q(`update report_entries set status = 'approved', approved_at = now(), approved_by = $2, review_note = null where id = $1 and status = 'submitted'`, [id, actorId]);
    else await q(`update report_entries set status = 'returned', review_note = $2 where id = $1 and status = 'submitted'`, [id, note || "Please have another look."]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'report_entry', $3, $4)`,
      [actorId, approve ? "approve" : "return", id, JSON.stringify({ note })]);
  });
}

export async function approveAllSubmitted(actorId: string, cycleId: string): Promise<number> {
  return withSchool(async (q) => {
    const r = await q(`update report_entries set status = 'approved', approved_at = now(), approved_by = $2, review_note = null where cycle_id = $1 and status = 'submitted' returning id`, [cycleId, actorId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'approve_all', 'report_cycle', $2, $3)`, [actorId, cycleId, JSON.stringify({ n: r.length })]);
    return r.length;
  });
}

export async function publishCycle(actorId: string, cycleId: string): Promise<string | null> {
  return withSchool(async (q) => {
    const left = (await q<{ n: number }>(`select count(*)::int as n from report_entries where cycle_id = $1 and status <> 'approved'`, [cycleId]))[0].n;
    if (left) return `${left} report${left === 1 ? " isn’t" : "s aren’t"} approved yet.`;
    await q(`update report_cycles set status = 'published', published_at = now() where id = $1`, [cycleId]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'publish', 'report_cycle', $2)`, [actorId, cycleId]);
    return null;
  });
}

// ---------- writing (teachers, or an admin for any class) ----------
export type WriteRow = { id: string; student: string; avg_pct: string | null; marked: number | null; auto_progress: number | null; progress_override: number | null;
  effort: number | null; working_grade: number | null; predicted_grade: number | null; comment: string | null; status: string; review_note: string | null };

export async function getWriteSheet(cycleId: string, groupId: string) {
  return withSchool(async (q) => {
    const head = (await q<{ cycle: string; status: string; comments_due: string; code: string; name: string; gcse: boolean; teacher_user: string | null }>(`
      select c.name as cycle, c.status::text, c.comments_due::text, g.code, l.name || ' ' || sj.name as name,
        (l.name ilike '%GCSE%' and l.name not ilike 'Pre-%') as gcse, t.user_id as teacher_user
      from report_cycles c, course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id left join teachers t on t.id = g.teacher_id
      where c.id = $1 and g.id = $2`, [cycleId, groupId]))[0];
    if (!head) return null;
    const rows = await q<WriteRow>(`select e.id, s.first_name || ' ' || s.last_name as student, rl.avg_pct::text, rl.marked,
        progress_score(e.school_id, rl.avg_pct) as auto_progress, e.progress_override, e.effort, e.working_grade, e.predicted_grade, e.comment, e.status::text, e.review_note
      from report_entries e join report_lines rl on rl.id = e.id join students s on s.id = e.student_id
      where e.cycle_id = $1 and e.group_id = $2 order by s.first_name, s.last_name`, [cycleId, groupId]);
    return { head, rows };
  });
}

export type WriteInput = { id: string; progress: number | null; effort: number | null; working: number | null; predicted: number | null; comment: string };
export async function saveWriteSheet(actor: { id: string; role: string }, cycleId: string, groupId: string, rows: WriteInput[], submit: boolean): Promise<string | null> {
  return withSchool(async (q) => {
    const ok = (await q<{ ok: boolean }>(`select ($3 = 'school_admin' or exists (select 1 from course_groups g join teachers t on t.id = g.teacher_id where g.id = $1 and t.user_id = $2))
      and exists (select 1 from report_cycles c where c.id = $4 and c.status <> 'published') as ok`, [groupId, actor.id, actor.role, cycleId]))[0]?.ok;
    if (!ok) return "You can’t edit these reports.";
    const problems: string[] = [];
    for (const r of rows) {
      const ready = r.effort != null && r.comment.trim().length >= 20;
      const status = submit && ready ? "submitted" : (r.effort != null || r.comment.trim()) ? "draft" : "todo";
      if (submit && !ready && (r.effort != null || r.comment.trim())) problems.push("x");
      await q(`update report_entries set progress_override = $2::smallint, effort = $3::smallint, working_grade = $4::smallint, predicted_grade = $5::smallint, comment = nullif($6, ''),
          status = case when status = 'approved' then status else $7::text::report_entry_status end, submitted_at = case when $7 = 'submitted' then now() else submitted_at end
        where id = $1 and cycle_id = $8 and group_id = $9 and status <> 'approved'`,
        [r.id, r.progress, r.effort, r.working, r.predicted, r.comment.trim().slice(0, 2000), status, cycleId, groupId]);
    }
    return problems.length ? `${problems.length} report${problems.length === 1 ? " was" : "s were"} saved as a draft: each needs an Effort score and a comment of at least 20 characters.` : null;
  });
}

export async function teacherReportClasses(userId: string) {
  return withSchool((q) => q<{ cycle_id: string; cycle: string; comments_due: string; group_id: string; name: string; code: string; total: number; done: number }>(`
    select c.id as cycle_id, c.name as cycle, c.comments_due::text, g.id as group_id, l.name || ' ' || sj.name as name, g.code,
      count(e.id)::int as total, count(e.id) filter (where e.status in ('submitted','approved'))::int as done
    from report_entries e join report_cycles c on c.id = e.cycle_id join course_groups g on g.id = e.group_id join teachers t on t.id = g.teacher_id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    where t.user_id = $1 and c.status <> 'published' group by c.id, g.id, l.sort_order, l.name, sj.name order by c.comments_due, l.sort_order, sj.name`, [userId]));
}
