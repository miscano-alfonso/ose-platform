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
  effort: number | null; working_grade: number | null; predicted_grade: number | null; comment: string | null; status: string; review_note: string | null;
  assess: string; assess_pct: number | null; assess_title: string | null; no_assessment: string | null };

export async function getWriteSheet(cycleId: string, groupId: string) {
  return withSchool(async (q) => {
    const head = (await q<{ cycle: string; status: string; comments_due: string; code: string; name: string; gcse: boolean; teacher_user: string | null }>(`
      select c.name as cycle, c.status::text, c.comments_due::text, g.code, l.name || ' ' || sj.name as name,
        (l.name ilike '%GCSE%' and l.name not ilike 'Pre-%') as gcse, t.user_id as teacher_user
      from report_cycles c, course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id left join teachers t on t.id = g.teacher_id
      where c.id = $1 and g.id = $2`, [cycleId, groupId]))[0];
    if (!head) return null;
    const rows = await q<WriteRow>(`select e.id, s.first_name || ' ' || s.last_name as student, rl.avg_pct::text, rl.marked,
        progress_score(e.school_id, rl.avg_pct) as auto_progress, e.progress_override, e.effort, e.working_grade, e.predicted_grade, e.comment, e.status::text, e.review_note,
        a.state as assess, a.pct::float as assess_pct, a.title as assess_title, e.no_assessment
      from report_entries e join report_lines rl on rl.id = e.id join students s on s.id = e.student_id cross join lateral report_assessment(e.id) a
      where e.cycle_id = $1 and e.group_id = $2 order by s.first_name, s.last_name`, [cycleId, groupId]);
    return { head, rows };
  });
}

export type WriteInput = { id: string; progress: number | null; effort: number | null; working: number | null; predicted: number | null; comment: string; noAssessment?: string };
export async function saveWriteSheet(actor: { id: string; role: string }, cycleId: string, groupId: string, rows: WriteInput[], submit: boolean): Promise<string | null> {
  return withSchool(async (q) => {
    const ok = (await q<{ ok: boolean }>(`select ($3 = 'school_admin' or exists (select 1 from course_groups g join teachers t on t.id = g.teacher_id where g.id = $1 and t.user_id = $2))
      and exists (select 1 from report_cycles c where c.id = $4 and c.status <> 'published') as ok`, [groupId, actor.id, actor.role, cycleId]))[0]?.ok;
    if (!ok) return "You can’t edit these reports.";
    const problems: string[] = []; let waiting = 0;
    for (const r of rows) {
      // the round's assessment must be marked in Classroom first, unless Classroom isn't connected or the teacher says why there isn't one
      const [a] = await q<{ state: string }>(`select state from report_assessment($1)`, [r.id]);
      const assessOk = !a || a.state === "marked" || a.state === "unknown" || (r.noAssessment ?? "").trim().length >= 3;
      if (submit && !assessOk) waiting++;
      const ready = r.effort != null && r.comment.trim().length >= 20 && assessOk;
      const status = submit && ready ? "submitted" : (r.effort != null || r.comment.trim()) ? "draft" : "todo";
      if (submit && !ready && (r.effort != null || r.comment.trim())) problems.push("x");
      await q(`update report_entries set progress_override = $2::smallint, effort = $3::smallint, working_grade = $4::smallint, predicted_grade = $5::smallint, comment = nullif($6, ''),
          status = case when status = 'approved' then status else $7::text::report_entry_status end, submitted_at = case when $7 = 'submitted' then now() else submitted_at end
        where id = $1 and cycle_id = $8 and group_id = $9 and status <> 'approved'`,
        [r.id, r.progress, r.effort, r.working, r.predicted, r.comment.trim().slice(0, 2000), status, cycleId, groupId]);
      if (r.noAssessment !== undefined) await q(`update report_entries set no_assessment = nullif($2, '') where id = $1 and cycle_id = $3`, [r.id, r.noAssessment.trim().slice(0, 200), cycleId]);
    }
    if (!problems.length) return null;
    return `${problems.length} report${problems.length === 1 ? " was" : "s were"} saved as a draft: each needs an Effort score, a comment of at least 20 characters${waiting ? `, and the assessment marked in Classroom (or a reason there isn’t one: ${waiting} waiting)` : ""}.`;
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

// ---------- the prototype's Reports view: grading key, previews, by teacher, past reports, reminders ----------
export type Band = { score: number; label: string; min_pct: number };
export async function gradeBands(): Promise<Band[]> {
  return withSchool((q) => q<Band>(`select score, label, min_pct::float as min_pct from grade_bands order by score desc`));
}
export async function saveBand(actorId: string, score: number, min: number): Promise<string | null> {
  if (!(score >= 2 && score <= 5) || !(min >= 1 && min <= 99)) return "Enter a percentage between 1 and 99.";
  return withSchool(async (q) => {
    const bands = await q<Band>(`select score, label, min_pct::float as min_pct from grade_bands order by score`);
    const lower = bands.find((b) => b.score === score - 1), higher = bands.find((b) => b.score === score + 1);
    if ((lower && min <= lower.min_pct) || (higher && min >= higher.min_pct)) return "Each band must start above the one below it and below the one above it.";
    await q(`update grade_bands set min_pct = $2 where score = $1`, [score, min]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'band', 'grade_bands', null, $2)`, [actorId, JSON.stringify({ score, min })]);
    return null;
  });
}
export async function cycleStudents(cycleId: string) {
  return withSchool((q) => q<{ id: string; name: string; level: string; subjects: number; approved: number }>(`select s.id, s.first_name || ' ' || s.last_name as name,
      string_agg(distinct rl.level, ', ') as level, count(*)::int as subjects, count(*) filter (where rl.status = 'approved')::int as approved
    from report_lines rl join students s on s.id = rl.student_id where rl.cycle_id = $1 group by s.id order by s.first_name, s.last_name`, [cycleId]));
}
export async function byTeacher(cycleId: string) {
  return withSchool((q) => q<{ teacher: string; total: number; done: number }>(`select coalesce(u.name, 'No teacher') as teacher, count(*)::int as total,
      count(*) filter (where e.status in ('submitted','approved'))::int as done
    from report_entries e left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id where e.cycle_id = $1 group by u.name order by u.name`, [cycleId]));
}
export type ReportLine = { subject: string; level: string; teacher: string | null; progress: number | null; effort: number | null; working_grade: number | null; predicted_grade: number | null; comment: string | null; status: string };
export async function studentReport(cycleId: string, studentId: string) {
  return withSchool(async (q) => {
    const head = (await q<{ cycle: string; publish_on: string; student: string; school: string }>(`select c.name as cycle, c.publish_on::text, s.first_name || ' ' || s.last_name as student, sc.name as school
      from report_cycles c, students s, schools sc where c.id = $1 and s.id = $2 and sc.id = current_school()`, [cycleId, studentId]))[0];
    if (!head) return null;
    const lines = await q<ReportLine>(`select rl.subject, rl.level, u.name as teacher, rl.progress, rl.effort, rl.working_grade, rl.predicted_grade, rl.comment, rl.status::text
      from report_lines rl join report_entries e on e.id = rl.id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where rl.cycle_id = $1 and rl.student_id = $2 order by rl.subject`, [cycleId, studentId]);
    const bands = await q<{ score: number; label: string }>(`select score, label from grade_bands order by score desc`);
    return { ...head, lines, bands };
  });
}
/** Email each teacher who still has comments to write in this report round. */
export async function remindTeachers(actorId: string, cycleId: string): Promise<{ sent: number; error?: string }> {
  const { sendHtml } = await import("./email");
  const rows = await withSchool((q) => q<{ name: string; email: string; left: number; due: string; cycle: string }>(`select u.name, u.email::text, count(*)::int as left,
      c.comments_due::text as due, c.name as cycle from report_entries e join report_cycles c on c.id = e.cycle_id join teachers t on t.id = e.teacher_id join users u on u.id = t.user_id
    where e.cycle_id = $1 and e.status in ('todo','draft','returned') group by u.name, u.email, c.comments_due, c.name`, [cycleId]));
  let sent = 0, error: string | undefined;
  for (const r of rows) {
    const due = new Date(r.due + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const res = await sendHtml(`${r.cycle}: ${r.left} comment${r.left === 1 ? "" : "s"} to write by ${due}`, `<p>Hello ${r.name.split(" ")[0]},</p><p>You have ${r.left} report comment${r.left === 1 ? "" : "s"} still to write for the ${r.cycle}. They’re due by ${due}.</p><p>Sign in and open <b>Reports to write</b> to finish them.</p>`, [r.email], "report-reminder");
    if (res.ok) sent++; else error = res.error;
  }
  await withSchool((q) => q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'remind', 'report_cycle', $2, $3)`, [actorId, cycleId, JSON.stringify({ sent })]));
  return { sent, error };
}
