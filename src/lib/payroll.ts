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
