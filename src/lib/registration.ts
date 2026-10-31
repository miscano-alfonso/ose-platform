import "server-only";
import { withSchool } from "./db";

// Parent registration on the website (31 Oct, from the old site's Add Child form): the parent, then each child with their
// Google account email (for Classroom and Meet), date of birth, classroom name, gender, SEND and any reports.
export type ChildIn = { first: string; last: string; email: string; dob: string | null; known: string | null; gender: string | null; send: boolean | null;
  files: { name: string; mime: string; data: Buffer }[] };
export type ParentIn = { first: string; last: string; email: string; phone: string | null; heard: string | null; marketing: boolean };
export const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to answer"];
export const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkChild(c: ChildIn, n: number): string | null {
  const who = `Child ${n}`;
  if (!c.first || !c.last) return `${who}: add their first and last name.`;
  if (!EMAIL.test(c.email)) return `${who}: add their Google (Gmail) email address.`;
  if (c.dob && !/^\d{4}-\d{2}-\d{2}$/.test(c.dob)) return `${who}: check the date of birth.`;
  for (const f of c.files) {
    if (!FILE_TYPES.includes(f.mime)) return `${who}: reports must be PDFs, Word documents or photos.`;
    if (f.data.length > 3.5 * 1024 * 1024) return `${who}: each report must be under 3.5 MB.`;
  }
  return null;
}

async function insertChildren(q: Parameters<Parameters<typeof withSchool>[0]>[0], parentId: string, kids: ChildIn[]) {
  for (const c of kids) {
    const [s] = await q<{ id: string }>(`insert into students (school_id, parent_id, first_name, last_name, email, date_of_birth, known_as, gender, has_send)
      values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8) returning id`, [parentId, c.first, c.last, c.email.toLowerCase(), c.dob, c.known, c.gender, c.send]);
    for (const f of c.files) await q(`insert into student_files (school_id, student_id, name, mime, size, data) values (current_school(), $1, $2, $3, $4, $5)`,
      [s.id, f.name.slice(0, 200), f.mime, f.data.length, f.data]);
  }
}

/** A new family. Returns the parent id, or "exists" when that email already has an account (they sign in instead). */
export async function registerFamily(p: ParentIn, kids: ChildIn[]): Promise<string | "exists"> {
  return withSchool(async (q) => {
    if ((await q(`select 1 from parents where email = $1`, [p.email.toLowerCase()])).length) return "exists";
    const [row] = await q<{ id: string }>(`insert into parents (school_id, first_name, last_name, email, phone, heard_about, marketing_opt_in, marketing_changed_at)
      values (current_school(), $1, $2, $3, $4, $5, $6, case when $6 then now() end) returning id`, [p.first, p.last, p.email.toLowerCase(), p.phone, p.heard, p.marketing]);
    await insertChildren(q, row.id, kids);
    await q(`insert into audit_log (school_id, action, entity, entity_id, detail) values (current_school(), 'create', 'parent', $1, $2)`, [row.id, JSON.stringify({ via: "website registration", children: kids.length })]);
    return row.id;
  });
}

export async function addChildren(parentId: string, kids: ChildIn[]) {
  await withSchool((q) => insertChildren(q, parentId, kids));
}

export async function familyChildren(parentId: string): Promise<{ id: string; name: string }[]> {
  return withSchool((q) => q<{ id: string; name: string }>(`select id, first_name || ' ' || last_name as name from students where parent_id = $1 order by created_at`, [parentId]));
}
