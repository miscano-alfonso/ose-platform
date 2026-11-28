import "server-only";
import { withSchool } from "./db";
import { studentReport } from "./reports";

// 26 Nov: Reports → "Email the reports to parents". Each child's approved report as a PDF (laid out like the school's own reports,
// src/lib/report-pdf.ts) with a short covering note, to the account holder
// and a second parent who gets reports. Sent even while test mode is on (tag "report-full"), because the office presses the
// button for it after reading the reports; nothing else is let through.
export const REPORT_TAG = "report-full";
type Family = { student_id: string; child: string; parent: string; parent_last: string; email: string | null; g_first: string | null; g_last: string | null; g_email: string | null };

async function families(cycleId: string): Promise<Family[]> {
  return withSchool((q) => q<Family>(`select distinct s.id as student_id, s.first_name as child, p.first_name as parent, p.last_name as parent_last, p.email::text as email,
      g.first_name as g_first, g.last_name as g_last, g.email::text as g_email
    from report_entries e join students s on s.id = e.student_id join parents p on p.id = s.parent_id
    left join guardians g on g.parent_id = p.id and g.receives_reports
    where e.cycle_id = $1 and e.status = 'approved' order by s.first_name`, [cycleId]));
}

/** The email: a short note like the school's own ("Please find attached…"), signed by whoever sends it, with the report as a PDF. */
export async function reportEmail(cycleId: string, studentId: string, sender: string): Promise<{ subject: string; body: (to: string) => string; attachment: { name: string; content: string } } | null> {
  const r = await studentReport(cycleId, studentId);
  const { reportPdf } = await import("./report-pdf");
  const pdf = r ? await reportPdf(cycleId, studentId) : null;
  if (!r || !pdf) return null;
  const child = r.student.split(" ")[0];
  return {
    subject: `${r.school} ${r.cycle}`,
    body: (to) => [`Dear ${to},`, `Please find attached ${child}’s ${r.school} ${r.cycle}.`, `If you have any questions about the report, please do let me know.`, `Best wishes,\n${sender}`].join("\n\n"),
    attachment: { name: pdf.filename, content: Buffer.from(pdf.bytes).toString("base64") },
  };
}

/** 28 Nov: Reports → Parent email: the email one family will get, without building the PDF (the page links to it). */
export async function reportEmailPreview(cycleId: string, sender: string): Promise<{ to: string; email: string | null; second: string | null; child: string; studentId: string; subject: string; body: string; families: number } | null> {
  const fam = await families(cycleId);
  if (!fam.length) return null;
  const f = fam[0], r = await studentReport(cycleId, f.student_id);
  if (!r) return null;
  const to = `${f.parent} ${f.parent_last}`, child = r.student.split(" ")[0];
  return { to, email: f.email, second: f.g_email ? `${f.g_first ?? ""} ${f.g_last ?? ""}`.trim() : null, child, studentId: f.student_id, subject: `${r.school} ${r.cycle}`,
    body: [`Dear ${to},`, `Please find attached ${child}’s ${r.school} ${r.cycle}.`, `If you have any questions about the report, please do let me know.`, `Best wishes,\n${sender}`].join("\n\n"),
    families: new Set(fam.map((x) => x.email ?? x.student_id)).size };
}

export type ReportEmailStatus = { children: number; families: number; sent: number; failed: number; noEmail: number; lastAt: string | null };
export async function reportEmailStatus(cycleId: string): Promise<ReportEmailStatus> {
  const fam = await families(cycleId);
  const rows = await withSchool((q) => q<{ student_id: string; sent_at: string | null; error: string | null }>(`select student_id, sent_at::text, error from report_emails where cycle_id = $1`, [cycleId]));
  const sent = new Set(rows.filter((r) => r.sent_at).map((r) => r.student_id));
  return { children: fam.length, families: new Set(fam.map((f) => f.email ?? f.student_id)).size, sent: sent.size,
    failed: rows.filter((r) => !r.sent_at && r.error).length, noEmail: fam.filter((f) => !f.email).length,
    lastAt: rows.map((r) => r.sent_at).filter(Boolean).sort().pop() ?? null };
}

/** Email every child's report that hasn't gone yet (or, with testTo, one example to that address only). */
export async function emailReports(actorId: string, cycleId: string, testTo?: { email: string; name: string }, sender = "OH-SO ED"): Promise<{ sent: number; failed: number; error?: string }> {
  const { sendOne } = await import("./email");
  const fam = await families(cycleId);
  if (!fam.length) return { sent: 0, failed: 0, error: "No approved reports in this round yet." };
  if (testTo) {
    const f = fam[0], m = await reportEmail(cycleId, f.student_id, sender);
    if (!m) return { sent: 0, failed: 1, error: "Couldn’t build the example." };
    const r = await sendOne([{ email: testTo.email, name: testTo.name }], `[Test] ${m.subject}`, `(Test: this is how ${f.parent} ${f.parent_last}’s email will look, with ${f.child}’s report attached. Only you received it.)\n\n${m.body(`${f.parent} ${f.parent_last}`)}`, { tag: REPORT_TAG, attachments: [m.attachment] });
    return r.ok ? { sent: 1, failed: 0 } : { sent: 0, failed: 1, error: r.error };
  }
  const done = new Set((await withSchool((q) => q<{ student_id: string }>(`select student_id from report_emails where cycle_id = $1 and sent_at is not null`, [cycleId]))).map((r) => r.student_id));
  const todo = fam.filter((f) => !done.has(f.student_id) && f.email);
  let sent = 0, failed = 0;
  const one = async (f: Family) => {
    const m = await reportEmail(cycleId, f.student_id, sender);
    const main = { email: f.email!, name: `${f.parent} ${f.parent_last}` }, second = f.g_email && f.g_email.toLowerCase() !== f.email!.toLowerCase() ? { email: f.g_email, name: `${f.g_first ?? ""} ${f.g_last ?? ""}`.trim() } : null;
    // each parent gets their own copy, addressed to them by name
    const send = async (t: { email: string; name: string }) => m ? sendOne([t], m.subject, m.body(t.name), { tag: REPORT_TAG, attachments: [m.attachment] }).catch((e) => ({ ok: false, error: String(e) } as { ok: boolean; error?: string })) : { ok: false, error: "No approved report." };
    const res = [await send(main)].concat(second ? [await send(second)] : []);
    const r = res.every((x) => x.ok) ? { ok: true } : { ok: false, error: res.find((x) => !x.ok)?.error };
    const to = [main].concat(second ? [second] : []);
    if (r.ok) sent++; else failed++;
    await withSchool((q) => q(`insert into report_emails (school_id, cycle_id, student_id, sent_to, sent_by, sent_at, error) values (current_school(), $1, $2, $3, $4, $5, $6)
      on conflict (cycle_id, student_id) do update set sent_to = excluded.sent_to, sent_by = excluded.sent_by, sent_at = excluded.sent_at, error = excluded.error`,
      [cycleId, f.student_id, to.map((t) => t.email), actorId, r.ok ? new Date().toISOString() : null, r.ok ? null : (r.error ?? "Not sent").slice(0, 300)]));
  };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(one));   // six at a time
  await withSchool((q) => q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'email_reports', 'report_cycle', $2, $3)`,
    [actorId, cycleId, JSON.stringify({ sent, failed })]));
  return { sent, failed };
}
