import "server-only";
import { withSchool } from "./db";

// Admin → Term dates: school years, their six terms (and payment dates), and holidays. Prices follow the term dates.
export type YearRow = { id: string; label: string; starts_on: string; ends_on: string; sales_open_on: string };
export type TermRow = { id: string; number: number; name: string; starts_on: string; ends_on: string; bills_on: string; weeks: number };
export type Holiday = { id: string; name: string; starts_on: string; ends_on: string };

export async function getTermDates(yearId: string | null) {
  return withSchool(async (q) => {
    const years = await q<YearRow>(`select id, label, starts_on::text, ends_on::text, sales_open_on::text from academic_years where ends_on >= current_date - 30 order by starts_on`);
    const year = years.find((y) => y.id === yearId) ?? years.find((y) => y.starts_on <= new Date().toISOString().slice(0, 10)) ?? years[0] ?? null;
    const terms = year ? await q<TermRow>(`select id, number, name, starts_on::text, ends_on::text, bills_on::text, ceil((ends_on - starts_on + 1) / 7.0)::int as weeks
      from terms where academic_year_id = $1 order by number`, [year.id]) : [];
    const holidays = year ? await q<Holiday>(`select id, name, starts_on::text, ends_on::text from holidays where ends_on >= $1::date and starts_on <= $2::date + 60 order by starts_on`, [year.starts_on, year.ends_on]) : [];
    return { years, year, terms, holidays };
  });
}

const audit = (q: (s: string, p?: unknown[]) => Promise<unknown>, a: string, act: string, id: string | null, d: unknown) =>
  q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'term_dates', $3, $4)`, [a, act, id, JSON.stringify(d)]);

export async function addYear(actorId: string, d: { label: string; starts: string; ends: string; sales: string }): Promise<{ id?: string; error?: string }> {
  try {
    return await withSchool(async (q) => {
      const id = (await q<{ id: string }>(`insert into academic_years (school_id, label, starts_on, ends_on, sales_open_on) values (current_school(), $1, $2::date, $3::date, $4::date) returning id`,
        [d.label, d.starts, d.ends, d.sales]))[0].id;
      await audit(q, actorId, "add_year", id, d);
      return { id };
    });
  } catch (e) { return { error: (e as { code?: string }).code === "23505" ? "That school year already exists." : "Couldn’t add that year. Check the dates." }; }
}

/** Saves the six terms and re-prices the year from its rules, so lesson counts follow the new dates. */
export async function saveTerms(actorId: string, yearId: string, rows: { number: number; starts: string; ends: string; bills: string }[]): Promise<{ moved: number; error?: string }> {
  try {
    return await withSchool(async (q) => {
      for (const r of rows) {
        await q(`insert into terms (school_id, academic_year_id, number, name, starts_on, ends_on, bills_on) values (current_school(), $1, $2::int, 'Term ' || $2::int, $3::date, $4::date, $5::date)
          on conflict (academic_year_id, number) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, bills_on = excluded.bills_on`, [yearId, r.number, r.starts, r.ends, r.bills]);
      }
      let moved = 0;
      if ((await q(`select 1 from level_rules where academic_year_id = $1`, [yearId])).length) moved = (await q<{ n: number }>(`select apply_course_rules($1) as n`, [yearId]))[0].n;
      await audit(q, actorId, "save_terms", yearId, { terms: rows.length });
      return { moved };
    });
  } catch { return { moved: 0, error: "Couldn’t save the terms. Each term must end after it starts." }; }
}

export async function addHoliday(actorId: string, name: string, starts: string, ends: string) {
  await withSchool(async (q) => { await q(`insert into holidays (school_id, name, starts_on, ends_on) values (current_school(), $1, $2::date, $3::date)`, [name, starts, ends]); await audit(q, actorId, "add_holiday", null, { name, starts, ends }); });
}
export async function removeHoliday(actorId: string, id: string) {
  await withSchool(async (q) => { await q(`delete from holidays where id = $1`, [id]); await audit(q, actorId, "remove_holiday", id, {}); });
}
