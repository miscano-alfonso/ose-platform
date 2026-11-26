import "server-only";
import { withSchool } from "./db";

// Past paper marking as an order (26 Nov). A paper sent from the website (enquiries, kind 'marking') has a marking_jobs row.
// It becomes paid when its Stripe payment is spotted (read-only Stripe copy: same email, the marking price, paid after it
// was sent) or when the office presses Paid. Paying hands it to the subject's teacher (Admin → Workshops → Past paper
// marking) with a "back by" time 48 hours later, and emails them. The teacher can warn of a delay (new time + reason: the
// parent is emailed and the office sees it flagged) and sends the marked paper back, which emails it to the parent.
// Emails go through the usual test-mode gate (held while test mode is on, as Alfonso chose).

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export const TURNAROUND_HOURS = 48;
export const MARKING_PRICE = 2000;   // pence, as MARKING_PRICE_PENCE on the website
const SITE = () => (process.env.SITE_URL || "https://dev.ohsoed.co.uk").replace(/\/$/, "");
export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const first = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] || "there";

export type PaperJob = { id: string; created_at: string; parent: string; email: string; child: string | null; subject: string | null; message: string | null; file_name: string | null;
  handled_at: string | null; teacher_id: string | null; teacher: string | null; paid_at: string | null; paid_how: string | null; due_at: string | null; teacher_emailed_at: string | null;
  delay_until: string | null; delay_reason: string | null; delayed_at: string | null; returned_at: string | null; returned_name: string | null; return_note: string | null };
const JOB_SQL = `select e.id, e.created_at::text, e.name as parent, e.email::text, e.child_name as child, e.subject, e.message, e.file_name, e.handled_at::text,
    j.teacher_id, tu.name as teacher, j.paid_at::text, j.paid_how, j.due_at::text, j.teacher_emailed_at::text, j.delay_until::text, j.delay_reason, j.delayed_at::text,
    j.returned_at::text, j.returned_name, j.return_note
  from enquiries e join marking_jobs j on j.enquiry_id = e.id left join teachers t on t.id = j.teacher_id left join users tu on tu.id = t.user_id`;

/** When the paper is due back now: the teacher's delay time if they gave one, otherwise paid + 48 hours. */
export const backBy = (j: Pick<PaperJob, "due_at" | "delay_until">) => j.delay_until ?? j.due_at;
/** Hours left until it's due back (negative = late). */
export const hoursLeft = (iso: string) => (Date.parse(iso.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) - Date.now()) / 36e5;
export function countdownHours(h: number) {
  if (h < 0) { const late = Math.ceil(-h); return late >= 24 ? `${Math.round(late / 24)} day${Math.round(late / 24) === 1 ? "" : "s"} late` : `${late} hour${late === 1 ? "" : "s"} late`; }
  const n = Math.floor(h); return n >= 24 ? `${Math.floor(n / 24)} day${Math.floor(n / 24) === 1 ? "" : "s"} ${n % 24} h left` : n < 1 ? "Due within the hour" : `${n} hour${n === 1 ? "" : "s"} left`;
}

// ---------- settings: which teacher marks which subject ----------
export async function subjectTeachers(): Promise<Record<string, string>> {
  const rows = await withSchool((q) => q<{ subject: string; teacher_id: string }>(`select subject, teacher_id from marking_subject_teachers`)).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.subject, r.teacher_id]));
}
export async function saveSubjectTeachers(map: Record<string, string>) {
  await withSchool(async (q) => {
    await q(`delete from marking_subject_teachers`);
    for (const [subject, teacher] of Object.entries(map)) if (subject && /^[0-9a-f-]{36}$/.test(teacher))
      await q(`insert into marking_subject_teachers (school_id, subject, teacher_id) select current_school(), $1, $2 where exists (select 1 from teachers where id = $2)`, [subject.slice(0, 80), teacher]);
  });
}

// ---------- the office ----------
export async function adminPapers(): Promise<PaperJob[]> {
  // papers handled before this list existed and never marked paid are left out
  return withSchool((q) => q<PaperJob>(`${JOB_SQL} where e.kind = 'marking' and (j.paid_at is not null or e.handled_at is null or e.created_at > now() - interval '30 days')
    order by (j.paid_at is not null and j.returned_at is null) desc, (j.paid_at is null and e.handled_at is null) desc, coalesce(j.delay_until, j.due_at, e.created_at) desc limit 200`));
}
/** A new paper from the website: its job, given to the subject's teacher. */
export async function newPaperJob(q: Q, enquiryId: string, subject: string) {
  await q(`insert into marking_jobs (enquiry_id, school_id, teacher_id) values ($1, current_school(), (select teacher_id from marking_subject_teachers where subject = $2)) on conflict do nothing`, [enquiryId, subject]);
}
export async function setPaperTeacher(id: string, teacherId: string | null): Promise<void> {
  const paid = await withSchool(async (q) => {
    const [j] = await q<{ paid: boolean; returned: boolean }>(`update marking_jobs set teacher_id = $2, teacher_emailed_at = null, updated_at = now() where enquiry_id = $1
      returning paid_at is not null as paid, returned_at is not null as returned`, [id, teacherId]);
    return !!j?.paid && !j.returned;
  });
  if (paid && teacherId) await emailTeacher(id);
}
/** Paid: by the office, or by a Stripe payment that matches. Starts the 48 hours and emails the teacher. */
export async function markPaid(id: string, how: "stripe" | "office", chargeId: string | null = null): Promise<boolean> {
  const ok = await withSchool(async (q) => (await q(`update marking_jobs set paid_at = now(), paid_how = $2, stripe_charge_id = $3, due_at = now() + make_interval(hours => $4), updated_at = now()
    where enquiry_id = $1 and paid_at is null returning enquiry_id`, [id, how, chargeId, TURNAROUND_HOURS])).length > 0);
  if (ok) await emailTeacher(id);
  return ok;
}
export async function markUnpaid(id: string) {
  await withSchool((q) => q(`update marking_jobs set paid_at = null, paid_how = null, stripe_charge_id = null, due_at = null, teacher_emailed_at = null, updated_at = now()
    where enquiry_id = $1 and returned_at is null`, [id]));
}

/** Stripe payments of the marking price from the same email, made after the paper was sent (up to 14 days), not used yet. */
export async function matchMarkingPayments(q: Q): Promise<string[]> {
  const hits = await q<{ id: string; charge: string }>(`
    select distinct on (e.id) e.id, c.id as charge from enquiries e join marking_jobs j on j.enquiry_id = e.id
      join stripe_charges c on lower(c.email::text) = lower(e.email::text) and c.status = 'succeeded' and c.amount_pence = $1 and c.refunded_pence = 0
        and c.created_at between e.created_at - interval '2 hours' and e.created_at + interval '14 days' and c.matched_at is null
        and not exists (select 1 from marking_jobs j2 where j2.stripe_charge_id = c.id)
    where e.kind = 'marking' and j.paid_at is null and e.created_at > now() - interval '30 days'
    order by e.id, c.created_at`, [MARKING_PRICE]);
  const done: string[] = [], used = new Set<string>();
  for (const h of hits) {
    if (used.has(h.charge)) continue; used.add(h.charge);
    const ok = (await q(`update marking_jobs set paid_at = now(), paid_how = 'stripe', stripe_charge_id = $2, due_at = now() + make_interval(hours => $3), updated_at = now()
      where enquiry_id = $1 and paid_at is null returning enquiry_id`, [h.id, h.charge, TURNAROUND_HOURS])).length > 0;
    // keep it out of the term-payment suggestions on Payments
    if (ok) { await q(`update stripe_charges set ignored = true where id = $1`, [h.charge]); done.push(h.id); }
  }
  return done;
}
/** After Stripe payments are copied: mark matching papers paid and email their teachers. */
export async function afterStripeSync(): Promise<number> {
  const ids = await withSchool((q) => matchMarkingPayments(q)).catch(() => [] as string[]);
  for (const id of ids) await emailTeacher(id).catch(() => null);
  return ids.length;
}

// ---------- emails ----------
async function job(id: string) { return (await withSchool((q) => q<PaperJob & { teacher_email: string | null; school: string }>(
  `${JOB_SQL.replace("select e.id,", "select tu.email::text as teacher_email, (select name from schools where id = current_school()) as school, e.id,")} where e.id = $1`, [id])))[0] ?? null; }
const what = (j: PaperJob) => `${j.subject ?? "a past paper"}${j.child ? ` for ${j.child}` : ""}`;

export async function emailTeacher(id: string): Promise<boolean> {
  const j = await job(id);
  if (!j?.teacher_email || !j.paid_at || j.returned_at) return false;
  const { sendOne } = await import("./email");
  const due = backBy(j)!;
  await sendOne([{ name: j.teacher ?? "", email: j.teacher_email }], `Past paper to mark: ${j.subject ?? "past paper"} · back by ${when(due)}`,
    `Hello ${first(j.teacher)},\n\nA past paper has been paid for and is yours to mark: ${what(j)}.\n\nPlease send it back marked, with feedback in line with the mark scheme and targets for improvement, by ${when(due)} (${TURNAROUND_HOURS} hours from payment).` +
    (j.message ? `\n\nThe parent's note: "${j.message}"` : "") +
    `\n\nDownload the paper and send it back from your dashboard:\n${SITE()}/admin/teacher/marking#papers\n\nIf it's going to take longer, press "Warn of a delay" there, with a new time and a short reason. We'll let the parent know.\n\n${j.school}`,
    { tag: "marking-teacher" });
  await withSchool((q) => q(`update marking_jobs set teacher_emailed_at = now() where enquiry_id = $1`, [id]));
  return true;
}

// ---------- the teacher ----------
export async function teacherPapers(userId: string): Promise<PaperJob[]> {
  return withSchool((q) => q<PaperJob>(`${JOB_SQL} where e.kind = 'marking' and j.paid_at is not null and t.user_id = $1 and (j.returned_at is null or j.returned_at > now() - interval '14 days')
    order by j.returned_at is not null, coalesce(j.delay_until, j.due_at)`, [userId]));
}
async function mine(q: Q, userId: string, id: string) {
  return (await q<{ ok: boolean }>(`select true as ok from marking_jobs j join teachers t on t.id = j.teacher_id where j.enquiry_id = $1 and t.user_id = $2 and j.paid_at is not null`, [id, userId]))[0]?.ok ?? false;
}
/** The teacher warns it'll be late: a new time and a reason. The parent is emailed; the office sees it flagged. */
export async function warnDelay(userId: string, id: string, untilIso: string, reason: string): Promise<string | null> {
  const t = Date.parse(untilIso);
  if (isNaN(t)) return "Choose when it'll be back.";
  if (t < Date.now() + 30 * 60e3) return "The new time must be later than now.";
  if (t > Date.now() + 14 * 864e5) return "Choose a time in the next two weeks.";
  if (reason.trim().length < 5) return "Add a short reason for the parent.";
  const ok = await withSchool(async (q) => {
    if (!(await mine(q, userId, id))) return false;
    return (await q(`update marking_jobs set delay_until = $2, delay_reason = $3, delayed_at = now(), updated_at = now() where enquiry_id = $1 and returned_at is null returning enquiry_id`,
      [id, new Date(t).toISOString(), reason.trim().slice(0, 400)])).length > 0;
  });
  if (!ok) return "You can't change this paper.";
  const j = await job(id);
  if (j) {
    const { sendOne } = await import("./email");
    await sendOne([{ name: j.parent, email: j.email }], `Your past paper: a short delay`,
      `Dear ${j.parent},\n\nThank you for sending ${j.child ? `${j.child}'s` : "your"} ${j.subject ?? "past"} paper. I'm sorry, it's going to take a little longer than our usual ${TURNAROUND_HOURS} hours: we'll send it back marked by ${when(j.delay_until!)}.\n\n${j.delay_reason}\n\nIf you have any questions, just reply to this email.\n\nBest wishes,\n${j.teacher ?? j.school}\n${j.school}`,
      { tag: "marking-delay" });
    const { officeInfo } = await import("./teacher-area");
    const box = (await officeInfo().catch(() => ({ mailbox: null as string | null }))).mailbox;
    if (box) await sendOne([{ name: "The office", email: box }], `Past paper delayed: ${what(j)}`,
      `${j.teacher ?? "The teacher"} has warned that ${what(j)} (from ${j.parent}) will be late.\n\nNew time: ${when(j.delay_until!)}\nReason: ${j.delay_reason}\n\nThe parent has been emailed. Admin → Workshops → Past paper marking:\n${SITE()}/admin/workshops?tab=papers`,
      { tag: "marking-office" });
  }
  return null;
}
const RETURN_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
/** The teacher sends the marked paper back: it's emailed to the parent with the file attached. */
export async function returnPaper(userId: string, id: string, file: File | null, note: string): Promise<string | null> {
  if (!file || file.size === 0) return "Attach the marked paper.";
  if (!RETURN_TYPES.includes(file.type)) return "The marked paper must be a PDF, Word document or photo (JPG, PNG).";
  if (file.size > 3.5 * 1024 * 1024) return "The file must be under 3.5 MB.";
  const data = Buffer.from(await file.arrayBuffer());
  const ok = await withSchool(async (q) => {
    if (!(await mine(q, userId, id))) return false;
    return (await q(`update marking_jobs set returned_at = now(), returned_file = $2, returned_name = $3, returned_type = $4, return_note = nullif($5, ''), updated_at = now()
      where enquiry_id = $1 and returned_at is null returning enquiry_id`, [id, data, file.name.slice(0, 160), file.type, note.trim().slice(0, 2000)])).length > 0;
  });
  if (!ok) return "You can't send this paper back (it may already have been sent).";
  const j = await job(id);
  if (j) {
    const { sendOne } = await import("./email");
    await sendOne([{ name: j.parent, email: j.email }], `Your marked past paper: ${j.subject ?? "past paper"}`,
      `Dear ${j.parent},\n\nPlease find attached ${j.child ? `${j.child}'s` : "your"} marked ${j.subject ?? "past paper"}, with feedback and targets for improvement.` +
      (j.return_note ? `\n\n${j.return_note}` : "") + `\n\nIf you have any questions, just reply to this email.\n\nBest wishes,\n${j.teacher ?? j.school}\n${j.school}`,
      { tag: "marking-return", attachments: [{ name: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "marked-paper", content: data.toString("base64") }] });
  }
  return null;
}
/** The paper (or the marked one) for download: admins, or the paper's teacher once it's paid. */
export async function paperFile(viewer: { id: string; role: string }, id: string, marked: boolean) {
  return withSchool(async (q) => {
    if (viewer.role !== "school_admin" && !(await mine(q, viewer.id, id))) return null;
    const r = await q<{ file: Buffer; file_type: string; file_name: string }>(marked
      ? `select returned_file as file, returned_type as file_type, returned_name as file_name from marking_jobs where enquiry_id = $1 and returned_file is not null`
      : `select file, file_type, file_name from enquiries where id = $1 and file is not null`, [id]);
    return r[0] ?? null;
  });
}

/** Papers waiting for payment: copy new Stripe payments (read only, at most every 10 minutes) and match them.
 *  Runs from the daily job, the Stripe webhook and when the office opens Past paper marking. */
export async function paperPaymentsBackground(force = false): Promise<{ matched: number; error?: string }> {
  const waiting = await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from marking_jobs j join enquiries e on e.id = j.enquiry_id
    where j.paid_at is null and e.handled_at is null and e.created_at > now() - interval '14 days'`)).then((r) => r[0]?.n ?? 0).catch(() => 0);
  if (!waiting) return { matched: 0 };
  const s = await import("./stripe-read");
  const st = await s.stripeStatus().catch(() => null);
  if (!st?.connected) return { matched: await afterStripeSync() };
  const last = st.sync?.at ? Date.parse(st.sync.at) : 0;
  if (!force && Date.now() - last < 10 * 60e3) return { matched: await afterStripeSync() };
  const r = await s.syncStripe();   // calls afterStripeSync itself
  return { matched: 0, error: r.error };
}
