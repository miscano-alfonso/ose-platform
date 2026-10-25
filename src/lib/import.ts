import "server-only";
import { withSchool } from "./db";

// Importing families from the old system (TechSaga). The file is made outside the app and uploaded by an admin;
// nothing personal is kept in the code. Re-running the same file changes nothing that's already there.
export type ImportCourse = { level: string; subject: string; enrolled_on?: string; techsaga_terms_paid?: string; needs_check?: boolean; note?: string; course_total_pence?: number };
export type ImportChild = { first: string; last: string; email?: string | null; courses: ImportCourse[] };
export type ImportFamily = { parent: { first: string; last: string; email: string; phone?: string | null }; note?: string | null; children: ImportChild[] };
export type ImportFile = { format: "ose-families-1"; year: string; source?: string; families: ImportFamily[] };
export type ImportReport = { families: number; children: number; enrolments: number; skipped: number; classesCreated: string[]; capacityRaised: string[]; flagged: number; warnings: string[] };

const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS = ["KS3", "Pre-GCSE", "iGCSE", "A-Level"];

/** Checks the uploaded file's shape. Returns the cleaned data or a list of problems. */
export function parseImport(text: string): { data?: ImportFile; errors?: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { errors: ["The file isn’t valid JSON."] }; }
  const f = raw as ImportFile, errors: string[] = [];
  if (!f || f.format !== "ose-families-1") return { errors: ["This isn’t an OH-SO ED families import file (format ose-families-1)."] };
  if (!/^\d{4}\/\d{2}$/.test(s(f.year))) errors.push("Missing year, e.g. 2026/27.");
  if (!Array.isArray(f.families) || f.families.length === 0 || f.families.length > 2000) errors.push("No families in the file.");
  const families: ImportFamily[] = [];
  (f.families || []).forEach((fam, i) => {
    const p = fam?.parent, email = s(p?.email).toLowerCase(), where = `Family ${i + 1}`;
    if (!s(p?.first) || !s(p?.last) || !EMAIL.test(email)) { errors.push(`${where}: parent needs a first name, last name and email.`); return; }
    const children: ImportChild[] = [];
    (fam.children || []).forEach((c, j) => {
      if (!s(c?.first) || !s(c?.last)) { errors.push(`${where}, child ${j + 1}: needs a first and last name.`); return; }
      const courses: ImportCourse[] = [];
      (c.courses || []).forEach((k) => {
        if (!LEVELS.includes(s(k?.level)) || !s(k?.subject)) { errors.push(`${where}, ${s(c.first)}: a course needs a level (${LEVELS.join(", ")}) and subject.`); return; }
        courses.push({ level: s(k.level), subject: s(k.subject, 80), enrolled_on: DATE.test(s(k.enrolled_on)) ? s(k.enrolled_on) : undefined,
          techsaga_terms_paid: s(k.techsaga_terms_paid, 20) || undefined, needs_check: !!k.needs_check, note: s(k.note, 1000) || undefined,
          course_total_pence: Number.isInteger(k.course_total_pence) && k.course_total_pence! > 0 && k.course_total_pence! < 1000000 ? k.course_total_pence : undefined });
      });
      const ce = s(c.email).toLowerCase();
      children.push({ first: s(c.first, 80), last: s(c.last, 80), email: EMAIL.test(ce) ? ce : null, courses });
    });
    families.push({ parent: { first: s(p.first, 80), last: s(p.last, 80), email, phone: s(p.phone, 40) || null }, note: s(fam.note, 2000) || null, children });
  });
  return errors.length ? { errors: errors.slice(0, 30) } : { data: { format: "ose-families-1", year: s(f.year), source: s(f.source, 120) || "Import", families } };
}

// iGCSE subjects taught over two years (the rest are 1-year courses)
const TWO_YEAR = /maths|geography|history|business|science double/i;
const COLOURS: Record<string, string> = { "Maths Higher": "#3f8a5e", "Maths Foundation": "#6fb487", "Science Double Award": "#a39a1e" };

export async function runImport(data: ImportFile, actorId: string): Promise<ImportReport> {
  const rep: ImportReport = { families: 0, children: 0, enrolments: 0, skipped: 0, classesCreated: [], capacityRaised: [], flagged: 0, warnings: [] };
  await withSchool(async (q) => {
    const year = (await q<{ id: string; yy: string }>(`select id, right(split_part(label, '/', 1), 2) as yy from academic_years where label = $1`, [data.year]))[0];
    if (!year) throw new Error(`The ${data.year} year isn’t set up yet.`);
    const groupFor = new Map<string, string>();
    const findGroup = async (level: string, subject: string): Promise<string> => {
      const key = `${level}|${subject}`;
      if (groupFor.has(key)) return groupFor.get(key)!;
      const found = await q<{ id: string }>(`select g.id from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
        where g.academic_year_id = $1 and l.name = $2 and lower(sj.name) = lower($3) and g.continues_group_id is null and g.status <> 'closed'
        order by g.code limit 1`, [year.id, level, subject]);
      if (found[0]) { groupFor.set(key, found[0].id); return found[0].id; }
      // no class yet: create it, hidden from the website until lesson times are added
      const lvl = (await q<{ id: string }>(`select id from levels where name = $1`, [level]))[0];
      if (!lvl) throw new Error(`Level ${level} isn’t set up.`);
      let sj = (await q<{ id: string }>(`select id from subjects where lower(name) = lower($1)`, [subject]))[0];
      if (!sj) sj = (await q<{ id: string }>(`insert into subjects (school_id, name, colour) values (current_school(), $1, $2) returning id`, [subject, COLOURS[subject] ?? "#8494c2"]))[0];
      const planName = level === "KS3" ? "KS3" : level === "Pre-GCSE" ? "Pre-GCSE" : level === "A-Level" ? "A-Level 2-year, year 1"
        : TWO_YEAR.test(subject) ? "GCSE 2-year, year 1" : "GCSE 1-year";
      const plan = (await q<{ id: string }>(`select id from price_plans where academic_year_id = $1 and name = $2`, [year.id, planName]))[0];
      if (!plan) throw new Error(`No ${planName} price plan for ${data.year}.`);
      const words = subject.split(/\s+/), prefix = ({ KS3: "K", "Pre-GCSE": "P", iGCSE: "G", "A-Level": "A" } as Record<string, string>)[level];
      const initials = words[0].slice(0, 3) + words.slice(1).map((w) => w[0].toUpperCase()).join("");   // Maths Higher -> MatH
      let code = `${prefix}${initials}${year.yy}/1`, n = 1;
      while ((await q(`select 1 from course_groups where code = $1`, [code])).length) code = `${prefix}${initials}${year.yy}/${++n}`;
      const g = (await q<{ id: string }>(`insert into course_groups (school_id, academic_year_id, level_id, subject_id, price_plan_id, code, capacity, status, description)
        values (current_school(), $1, $2, $3, $4, $5, 12, 'hidden', $6) returning id`,
        [year.id, lvl.id, sj.id, plan.id, code, `Created by the ${data.source} import. Add lesson times, a teacher and check the course length (${planName}).`]))[0];
      rep.classesCreated.push(`${level} ${subject} (${code})`);
      groupFor.set(key, g.id);
      return g.id;
    };

    for (const fam of data.families) {
      const p = fam.parent;
      const parent = (await q<{ id: string; inserted: boolean }>(`
        insert into parents (school_id, first_name, last_name, email, phone, admin_note) values (current_school(), $1, $2, $3, $4::text, $5::text)
        on conflict (school_id, email) do update set admin_note = coalesce(excluded.admin_note, parents.admin_note)
        returning id, (xmax = 0) as inserted`, [p.first, p.last, p.email, p.phone, fam.note]))[0];
      if (parent.inserted) rep.families++;
      for (const c of fam.children) {
        let st = (await q<{ id: string }>(`select id from students where parent_id = $1 and lower(first_name) = lower($2) and lower(last_name) = lower($3)`,
          [parent.id, c.first, c.last]))[0];
        if (!st) {
          let email = c.email;
          if (email && (email === p.email || (await q(`select 1 from students where lower(email) = $1`, [email])).length)) {
            rep.warnings.push(`${c.first} ${c.last}: Google account ${email} is the parent’s or another child’s, so it was left blank.`); email = null;
          }
          st = (await q<{ id: string }>(`insert into students (school_id, parent_id, first_name, last_name, email, google_account_confirmed)
            values (current_school(), $1, $2, $3, $4::citext, $4::citext is not null) returning id`, [parent.id, c.first, c.last, email]))[0];
          rep.children++;
        }
        for (const k of c.courses) {
          const gid = await findGroup(k.level, k.subject);
          if ((await q(`select 1 from enrolments where student_id = $1 and group_id = $2 and status in ('pending','active')`, [st.id, gid])).length) { rep.skipped++; continue; }
          const full = (await q<{ full: boolean; code: string }>(`select group_is_full(id) as full, code from course_groups where id = $1`, [gid]))[0];
          if (full.full) {   // the real class is bigger than the capacity set here: raise it rather than refuse the child
            await q(`update course_groups set capacity = coalesce(capacity, 0) + 1 where id = $1 and capacity_mode = 'auto'`, [gid]);
            if (!rep.capacityRaised.includes(full.code)) rep.capacityRaised.push(full.code);
          }
          const noPayments = k.techsaga_terms_paid === "000000";
          const note = [k.note, k.techsaga_terms_paid ? `TechSaga terms paid: ${k.techsaga_terms_paid}` : null, noPayments ? "No payments recorded in TechSaga." : null].filter(Boolean).join(" · ");
          const flag = !!k.needs_check || noPayments;
          await q(`insert into enrolments (school_id, student_id, group_id, status, list_price_pence, allow_clash, enrolled_at, needs_check, admin_note, source, course_total_pence)
            select current_school(), $1, g.id, 'active', pp.total_pence, true, coalesce($2::date, now()), $3::boolean, nullif($4::text, ''), $5::text,
              coalesce($7::int, (select total_pence from course_price(pp.id)))
            from course_groups g join price_plans pp on pp.id = g.price_plan_id where g.id = $6`,
            [st.id, k.enrolled_on ?? null, flag, note, data.source, gid, k.course_total_pence ?? null]);
          rep.enrolments++; if (flag) rep.flagged++;
        }
      }
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'import', 'families', $2)`,
      [actorId, JSON.stringify({ source: data.source, year: data.year, ...rep, warnings: rep.warnings.length })]);
  });
  return rep;
}
