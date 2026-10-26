import "server-only";
import { withSchool } from "./db";

const YEAR_SQL = `(select id from academic_years where ends_on >= current_date order by starts_on limit 1)`;
export type LevelRate = { level_id: string; level: string; rate: number | null; valid_from: string | null };
export type PayLine = { id: string; teacher: string; lessons: number; lessons_pence: number; extras: number; extras_pence: number; adjustments_pence: number; adjustment_note: string | null; gross_pence: number };
export type PayTerm = { id: string; number: number; name: string; ends_on: string; pay_date: string; run_id: string | null; status: string | null;
  preview: { teacher: string; lessons: number; pay: number; extras: number; extras_pay: number }[]; lines: PayLine[] };

export async function getPayroll(): Promise<{ rates: LevelRate[]; terms: PayTerm[] }> {
  return withSchool(async (q) => {
    const rates = await q<LevelRate>(`select l.id as level_id, l.name as level, r.rate_pence as rate, r.valid_from::text
      from levels l left join lateral (select rate_pence, valid_from from pay_rates r where r.level_id = l.id and r.teacher_id is null and r.valid_from <= current_date
        order by valid_from desc limit 1) r on true order by l.sort_order`);
    const terms = await q<Omit<PayTerm, "preview" | "lines">>(`select t.id, t.number, t.name, t.ends_on::text, coalesce(r.pay_date, term_pay_date(t.id))::text as pay_date,
        r.id as run_id, r.status::text from terms t left join pay_runs r on r.term_id = t.id where t.academic_year_id = ${YEAR_SQL} order by t.number`);
    const out: PayTerm[] = [];
    for (const t of terms) {
      const preview = await q<PayTerm["preview"][number]>(`select u.name as teacher, coalesce(p.lessons,0)::int as lessons, coalesce(p.pay,0)::int as pay,
          coalesce(x.sessions,0)::int as extras, coalesce(x.pay,0)::int as extras_pay
        from teachers te join users u on u.id = te.user_id
        left join (select teacher_id, sum(lessons) as lessons, sum(pay_pence) as pay from teacher_term_pay where term_id = $1 group by teacher_id) p on p.teacher_id = te.id
        left join (select teacher_id, sum(sessions) as sessions, sum(pay_pence) as pay from teacher_term_extras where term_id = $1 group by teacher_id) x on x.teacher_id = te.id
        where p.teacher_id is not null or x.teacher_id is not null order by u.name`, [t.id]);
      const lines = t.run_id ? await q<PayLine>(`select l.id, u.name as teacher, l.lessons, l.lessons_pence, l.extras, l.extras_pence, l.adjustments_pence, l.adjustment_note, l.gross_pence
        from pay_run_lines l join teachers te on te.id = l.teacher_id join users u on u.id = te.user_id where l.pay_run_id = $1 order by u.name`, [t.run_id]) : [];
      out.push({ ...t, preview, lines });
    }
    return { rates, terms: out };
  });
}

const audit = (q: (s: string, p?: unknown[]) => Promise<unknown>, actor: string, action: string, entity: string, id: string | null, detail: unknown) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, $3, $4, $5)`, [actor, action, entity, id, JSON.stringify(detail)]);

export async function setLevelRate(actorId: string, levelId: string, pence: number) {
  await withSchool(async (q) => {
    await q(`insert into pay_rates (school_id, level_id, teacher_id, rate_pence, valid_from) values (current_school(), $1, null, $2::int, current_date)
      on conflict (school_id, level_id, teacher_id, valid_from) do update set rate_pence = excluded.rate_pence`, [levelId, pence]);
    await audit(q, actorId, "rate", "pay_rates", levelId, { pence });
  });
}

export async function buildPayRun(actorId: string, termId: string): Promise<string | null> {
  try {
    await withSchool(async (q) => { const r = await q<{ id: string }>(`select build_pay_run($1) as id`, [termId]); await audit(q, actorId, "build", "pay_run", r[0].id, {}); });
    return null;
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("already")) return "That pay run is already approved, so it can’t be rebuilt.";
    if (m.includes("null value")) return "Some taught lessons are at a level with no pay rate. Set every level’s pay per lesson first.";
    return "Couldn’t build the pay run.";
  }
}

export async function setAdjustment(actorId: string, lineId: string, pence: number, note: string | null): Promise<string | null> {
  return withSchool(async (q) => {
    const r = await q(`update pay_run_lines l set adjustments_pence = $2::int, adjustment_note = $3 from pay_runs r where r.id = l.pay_run_id and l.id = $1 and r.status = 'draft' returning l.id`, [lineId, pence, note]);
    if (!r.length) return "Only a draft pay run can be changed.";
    await audit(q, actorId, "adjust", "pay_run_line", lineId, { pence, note });
    return null;
  });
}

export async function setRunStatus(actorId: string, runId: string, to: "approved" | "paid" | "draft"): Promise<void> {
  await withSchool(async (q) => {
    if (to === "approved") await q(`update pay_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1 and status = 'draft'`, [runId, actorId]);
    if (to === "paid") await q(`update pay_runs set status = 'paid', paid_at = now() where id = $1 and status = 'approved'`, [runId]);
    if (to === "draft") await q(`update pay_runs set status = 'draft', approved_by = null, approved_at = null where id = $1 and status = 'approved'`, [runId]);
    await audit(q, actorId, to, "pay_run", runId, {});
  });
}

// ---------- the prototype's Payroll view: one term at a time ----------
const RATE = (lvl: string, tch: string, d: string) => `coalesce(
  (select r.rate_pence from pay_rates r where r.level_id = ${lvl} and r.teacher_id = ${tch} and r.valid_from <= ${d} order by r.valid_from desc limit 1),
  (select r.rate_pence from pay_rates r where r.level_id = ${lvl} and r.teacher_id is null and r.valid_from <= ${d} order by r.valid_from desc limit 1), 0)`;
export type PayTermOpt = { id: string; number: number; name: string; starts_on: string; ends_on: string; pay_date: string; run_id: string | null; status: string | null };
export type PayRow = { teacher_id: string; teacher: string; lessons: number; taught: number; by_level: Record<string, number>; lesson_pay: number; extras: number; extras_pay: number; adj: number; adj_note: string | null; gross: number; line_id: string | null };
export type PayChange = { kind: "cancelled" | "cover"; date: string; time: string; class: string; note: string | null; teacher: string | null };
export async function payrollTerm(termNumber: number | null) {
  return withSchool(async (q) => {
    const terms = await q<PayTermOpt>(`select t.id, t.number, t.name, t.starts_on::text, t.ends_on::text, coalesce(r.pay_date, term_pay_date(t.id))::text as pay_date, r.id as run_id, r.status::text
      from terms t left join pay_runs r on r.term_id = t.id where t.academic_year_id = ${YEAR_SQL} order by t.number`);
    const today = new Date().toISOString().slice(0, 10);
    const term = terms.find((t) => t.number === termNumber) ?? terms.find((t) => t.starts_on <= today && today <= t.ends_on) ?? [...terms].reverse().find((t) => t.ends_on < today) ?? terms[0];
    if (!term) return { terms, term: null, rows: [] as PayRow[], levels: [] as string[], changes: [] as PayChange[], counts: { all: 0, taught: 0, toCome: 0 } };
    const levels = (await q<{ name: string }>(`select name from levels order by sort_order`)).map((l) => l.name);
    const base = await q<{ teacher_id: string; teacher: string; level: string; lessons: number; taught: number; pay: number }>(`select e.teacher_id, u.name as teacher, l.name as level,
        count(*)::int as lessons, count(*) filter (where e.status = 'taught')::int as taught,
        sum(${RATE("g.level_id", "e.teacher_id", "e.lesson_date")})::int as pay
      from lesson_events e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join teachers t on t.id = e.teacher_id join users u on u.id = t.user_id
      where e.term_id = $1 and e.status <> 'cancelled' group by e.teacher_id, u.name, l.name`, [term.id]);
    const extras = await q<{ teacher_id: string; teacher: string; sessions: number; pay: number }>(`select x.teacher_id, u.name as teacher, sum(x.sessions)::int as sessions, sum(x.pay_pence)::int as pay
      from teacher_term_extras x join teachers t on t.id = x.teacher_id join users u on u.id = t.user_id where x.term_id = $1 group by x.teacher_id, u.name`, [term.id]).catch(() => []);
    const lines = term.run_id ? await q<{ id: string; teacher_id: string; adj: number; note: string | null; gross: number }>(`select id, teacher_id, adjustments_pence as adj, adjustment_note as note, gross_pence as gross
      from pay_run_lines where pay_run_id = $1`, [term.run_id]) : [];
    const map = new Map<string, PayRow>();
    const row = (id: string, name: string) => map.get(id) ?? (map.set(id, { teacher_id: id, teacher: name, lessons: 0, taught: 0, by_level: {}, lesson_pay: 0, extras: 0, extras_pay: 0, adj: 0, adj_note: null, gross: 0, line_id: null }), map.get(id)!);
    for (const b of base) { const r = row(b.teacher_id, b.teacher); r.lessons += b.lessons; r.taught += b.taught; r.by_level[b.level] = (r.by_level[b.level] ?? 0) + b.lessons; r.lesson_pay += b.pay; }
    for (const x of extras) { const r = row(x.teacher_id, x.teacher); r.extras += x.sessions; r.extras_pay += x.pay; }
    for (const r of map.values()) { const l = lines.find((x) => x.teacher_id === r.teacher_id); if (l && term.status !== "draft") { r.adj = l.adj; r.adj_note = l.note; r.gross = l.gross; r.line_id = l.id; } else { r.adj = l?.adj ?? 0; r.adj_note = l?.note ?? null; r.line_id = l?.id ?? null; r.gross = r.lesson_pay + r.extras_pay + r.adj; } }
    const changes = await q<PayChange>(`select case when e.status = 'cancelled' then 'cancelled' else 'cover' end as kind, e.lesson_date::text as date, to_char(s.starts_at,'HH24:MI') as time,
        l.name || ' ' || sj.name as class, e.note, u.name as teacher
      from lesson_events e join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.term_id = $1 and (e.status = 'cancelled' or e.teacher_id is distinct from s.teacher_id) order by e.lesson_date`, [term.id]);
    const [counts] = await q<{ all: number; taught: number; toCome: number }>(`select count(*) filter (where status <> 'cancelled')::int as all, count(*) filter (where status = 'taught')::int as taught,
      count(*) filter (where status = 'scheduled')::int as "toCome" from lesson_events where term_id = $1`, [term.id]);
    return { terms, term, rows: [...map.values()].sort((a, b) => a.teacher.localeCompare(b.teacher)), levels, changes, counts };
  });
}
