import "server-only";
import { withSchool } from "./db";
import { sendBatch, emailReady } from "./email";

// Vacancies (public /jobs) and teacher applications (Admin → Jobs).
// Rule from the school: no PGCE evidence or fewer than two referees → the application can't be made.

export type JobStatus = "draft" | "open" | "closed";
export type Job = { id: string; slug: string; title: string; subjects: string; location: string; hours: string; pay: string; closes_on: string | null;
  summary: string; description: string; status: JobStatus; created_at: string; is_open: boolean };
export type Referee = { name: string; job_title: string; organisation: string; email: string; phone: string; relationship: string };
export const APP_STATUSES: [string, string][] = [["new", "New"], ["shortlisted", "Shortlisted"], ["interview", "Interview"], ["offered", "Offered"],
  ["appointed", "Appointed"], ["rejected", "Not taken forward"], ["withdrawn", "Withdrawn"]];
export const DBS: [string, string][] = [["update_service", "Enhanced DBS on the Update Service"], ["current", "Enhanced DBS (not on the Update Service)"], ["willing", "No current DBS, happy to apply"]];
export const MIN_REFEREES = 2;
export const MAX_FILE = 3 * 1024 * 1024;

const JOB_COLS = `id, slug, title, subjects, location, hours, pay, closes_on::text, summary, description, status, created_at::text,
  (status = 'open' and (closes_on is null or closes_on >= (now() at time zone 'Europe/London')::date)) as is_open`;

export async function listOpenJobs(): Promise<Job[]> {
  try { return await withSchool((q) => q<Job>(`select ${JOB_COLS} from job_posts where status = 'open' and (closes_on is null or closes_on >= (now() at time zone 'Europe/London')::date) order by created_at desc`)); }
  catch { return []; }
}
/** A vacancy page: open or closed ones can be viewed (closed ones say so); drafts only by id preview. */
export async function getJobBySlug(slug: string): Promise<Job | null> {
  const r = await withSchool((q) => q<Job>(`select ${JOB_COLS} from job_posts where slug = $1 and status <> 'draft'`, [slug]));
  return r[0] ?? null;
}

export type JobAdmin = Job & { apps: number; new_apps: number };
export async function listJobsAdmin(): Promise<JobAdmin[]> {
  return withSchool((q) => q<JobAdmin>(`select ${JOB_COLS},
    (select count(*)::int from job_applications a where a.job_id = j.id) as apps,
    (select count(*)::int from job_applications a where a.job_id = j.id and a.status = 'new') as new_apps
    from job_posts j order by (status = 'open') desc, created_at desc`));
}
export async function getJob(id: string): Promise<Job | null> {
  const r = await withSchool((q) => q<Job>(`select ${JOB_COLS} from job_posts where id = $1`, [id]));
  return r[0] ?? null;
}

export type JobInput = { title: string; subjects: string; location: string; hours: string; pay: string; closes_on: string | null; summary: string; description: string; status: JobStatus };
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "job";

export async function createJob(actor: string, title: string): Promise<string> {
  return withSchool(async (q) => {
    let slug = slugify(title);
    if ((await q(`select 1 from job_posts where slug = $1`, [slug])).length) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const r = await q<{ id: string }>(`insert into job_posts (school_id, slug, title) values (current_school(), $1, $2) returning id`, [slug, title]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'create', 'job_post', $2, $3)`, [actor, r[0].id, JSON.stringify({ title })]);
    return r[0].id;
  });
}
export async function saveJob(actor: string, id: string, d: JobInput) {
  await withSchool(async (q) => {
    await q(`update job_posts set title = $2, subjects = $3, location = $4, hours = $5, pay = $6, closes_on = $7::date, summary = $8, description = $9, status = $10, updated_at = now() where id = $1`,
      [id, d.title, d.subjects, d.location, d.hours, d.pay, d.closes_on, d.summary, d.description, d.status]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'job_post', $2, $3)`, [actor, id, JSON.stringify({ title: d.title, status: d.status })]);
  });
}
export async function deleteJob(actor: string, id: string) {
  await withSchool(async (q) => {
    await q(`delete from job_posts where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'job_post', $2, '{}')`, [actor, id]);
  });
}

// ---- applications ----
export type FileIn = { data: Buffer; name: string; type: string };
export type ApplicationInput = { name: string; email: string; phone: string; location: string; subjects: string; pgce_subject: string; pgce_year: string;
  pgce: FileIn; cv: FileIn | null; cover_letter: string; right_to_work: boolean; dbs: string; referees: Referee[] };

export async function saveApplication(jobId: string, a: ApplicationInput): Promise<string> {
  if (a.referees.length < MIN_REFEREES) throw new Error("two referees are required");
  return withSchool(async (q) => {
    const r = await q<{ id: string }>(`insert into job_applications (school_id, job_id, name, email, phone, location, subjects, pgce_subject, pgce_year,
      pgce_file, pgce_file_name, pgce_file_type, cv_file, cv_file_name, cv_file_type, cover_letter, right_to_work, dbs, referees)
      values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb) returning id`,
      [jobId, a.name, a.email, a.phone, a.location, a.subjects, a.pgce_subject, a.pgce_year, a.pgce.data, a.pgce.name, a.pgce.type,
        a.cv?.data ?? null, a.cv?.name ?? null, a.cv?.type ?? null, a.cover_letter, a.right_to_work, a.dbs, JSON.stringify(a.referees)]);
    return r[0].id;
  });
}

export type AppRow = { id: string; job_id: string; name: string; email: string; subjects: string; status: string; created_at: string; job_title: string };
export async function listApplications(jobId?: string): Promise<AppRow[]> {
  return withSchool((q) => q<AppRow>(`select a.id, a.job_id, a.name, a.email, a.subjects, a.status, a.created_at::text, j.title as job_title
    from job_applications a join job_posts j on j.id = a.job_id where ($1::uuid is null or a.job_id = $1::uuid) order by a.created_at desc`, [jobId ?? null]));
}
export type AppFull = AppRow & { phone: string; location: string; pgce_subject: string; pgce_year: string; pgce_file_name: string; cv_file_name: string | null;
  cover_letter: string; right_to_work: boolean; dbs: string; referees: Referee[]; notes: string; job_slug: string };
export async function getApplication(id: string): Promise<AppFull | null> {
  const r = await withSchool((q) => q<AppFull>(`select a.id, a.job_id, a.name, a.email, a.subjects, a.status, a.created_at::text, j.title as job_title, j.slug as job_slug,
    a.phone, a.location, a.pgce_subject, a.pgce_year, a.pgce_file_name, a.cv_file_name, a.cover_letter, a.right_to_work, a.dbs, a.referees, a.notes
    from job_applications a join job_posts j on j.id = a.job_id where a.id = $1`, [id]));
  return r[0] ?? null;
}
export async function getApplicationFile(id: string, kind: "pgce" | "cv") {
  const col = kind === "pgce" ? "pgce" : "cv";
  const r = await withSchool((q) => q<{ data: Buffer | null; name: string | null; type: string | null }>(`select ${col}_file as data, ${col}_file_name as name, ${col}_file_type as type from job_applications where id = $1`, [id]));
  return r[0]?.data ? r[0] : null;
}
export async function setApplication(actor: string, id: string, status: string, notes: string) {
  await withSchool(async (q) => {
    await q(`update job_applications set status = $2, notes = $3, updated_at = now() where id = $1`, [id, status, notes]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'job_application', $2, $3)`, [actor, id, JSON.stringify({ status })]);
  });
}
export async function deleteApplication(actor: string, id: string) {
  await withSchool(async (q) => {
    await q(`delete from job_applications where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'delete', 'job_application', $2, '{}')`, [actor, id]);
  });
}
export async function newApplicationCount(): Promise<number> {
  try { return (await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from job_applications where status = 'new'`)))[0].n; } catch { return 0; }
}

// ---- alert email ----
export async function getAlertEmail(): Promise<string> {
  try { return (await withSchool((q) => q<{ value: string }>(`select value from site_content where key = 'jobs_alert_email'`)))[0]?.value ?? ""; } catch { return ""; }
}
export async function setAlertEmail(actor: string, email: string) {
  await withSchool(async (q) => {
    if (!email) await q(`delete from site_content where key = 'jobs_alert_email'`);
    else await q(`insert into site_content (school_id, key, value, updated_by) values (current_school(), 'jobs_alert_email', $1, $2)
      on conflict (school_id, key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`, [email, actor]);
  });
}
/** Short email to the office; never includes the applicant's documents. Quietly does nothing until Brevo is set up. */
export async function sendApplicationAlert(job: Job, applicant: string, appId: string, origin: string) {
  const to = await getAlertEmail();
  if (!to || !(await emailReady())) return;
  await sendBatch(`New application: ${job.title}`,
    `${applicant} has applied for ${job.title}.\n\nPGCE evidence and two referees were provided.\n\nRead the application in the admin:\n${origin}/admin/jobs/application/${appId}`,
    [{ name: "OH-SO ED office", email: to }], false).catch(() => {});
}

/** What a file really is, from its first bytes. */
export function sniffDoc(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buf.includes(Buffer.from("word/"))) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}
