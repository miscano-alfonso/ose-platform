import "server-only";
import { withSchool } from "./db";
import { studentReport } from "./reports";

// 26 Nov: Reports → "Email the reports to parents". Each child's approved report, written out in full, to the account holder
// and a second parent who gets reports. Sent even while test mode is on (tag "report-full"), because the office presses the
// button for it after reading the reports; nothing else is let through.
export const REPORT_TAG = "report-full";
type Family = { student_id: string; child: string; parent: string; email: string | null; g_first: string | null; g_email: string | null };

async function families(cycleId: string): Promise<Family[]> {
  return withSchool((q) => q<Family>(`select distinct s.id as student_id, s.first_name as child, p.first_name as parent, p.email::text as email,
      g.first_name as g_first, g.email::text as g_email
    from report_entries e join students s on s.id = e.student_id join parents p on p.id = s.parent_id
    left join guardians g on g.parent_id = p.id and g.receives_reports
    where e.cycle_id = $1 and e.status = 'approved' order by s.first_name`, [cycleId]));
}

/** The email: a short note, then each subject (teacher, scores, grades, comment), then what the scores mean. */
export async function reportEmail(cycleId: string, studentId: string, parentFirst: string): Promise<{ subject: string; body: string } | null> {
  const r = await studentReport(cycleId, studentId);
  if (!r) return null;
  const lines = r.lines.filter((l) => l.status === "approved");
  if (!lines.length) return null;
  const child = r.student.split(" ")[0];
  const label = (n: number | null) => n == null ? "–" : `${n} (${r.bands.find((b) => b.score === n)?.label ?? ""})`.replace(" ()", "");
  const parts = lines.map((l) => [
    `${l.subject.toUpperCase()}${l.level ? ` · ${l.level}` : ""}${l.teacher ? ` · ${l.teacher}` : ""}`,
    `Progress: ${label(l.progress)}   Effort: ${label(l.effort)}` + (l.working_grade != null ? `\nWorking grade: ${l.working_grade}   Predicted grade: ${l.predicted_grade ?? "–"}` : ""),
    (l.comment || "").trim(),
  ].filter(Boolean).join("\n"));
  const key = r.bands.length ? `What the scores mean: ${r.bands.map((b) => `${b.score} ${b.label}`).join(", ")}.` : "";
  return {
    subject: `${child}’s ${r.cycle}`,
    body: [`Dear ${parentFirst},`, `Here is ${child}’s ${r.cycle} from ${r.school}, with a section from each of ${child}’s teachers.`,
      ...parts, key, `If you have any questions about the report, just reply to this email and we’ll pass them on to the teacher.`, r.school].filter(Boolean).join("\n\n"),
  };
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
export async function emailReports(actorId: string, cycleId: string, testTo?: { email: string; name: string }): Promise<{ sent: number; failed: number; error?: string }> {
  const { sendOne } = await import("./email");
  const fam = await families(cycleId);
  if (!fam.length) return { sent: 0, failed: 0, error: "No approved reports in this round yet." };
  if (testTo) {
    const f = fam[0], m = await reportEmail(cycleId, f.student_id, f.parent);
    if (!m) return { sent: 0, failed: 1, error: "Couldn’t build the example." };
    const r = await sendOne([{ email: testTo.email, name: testTo.name }], `[Test] ${m.subject}`, `(Test: this is how ${f.parent}’s email will look. Only you received it.)\n\n${m.body}`, { tag: REPORT_TAG });
    return r.ok ? { sent: 1, failed: 0 } : { sent: 0, failed: 1, error: r.error };
  }
  const done = new Set((await withSchool((q) => q<{ student_id: string }>(`select student_id from report_emails where cycle_id = $1 and sent_at is not null`, [cycleId]))).map((r) => r.student_id));
  const todo = fam.filter((f) => !done.has(f.student_id) && f.email);
  let sent = 0, failed = 0;
  const one = async (f: Family) => {
    const m = await reportEmail(cycleId, f.student_id, f.parent);
    const to = [{ email: f.email!, name: f.parent }].concat(f.g_email && f.g_email.toLowerCase() !== f.email!.toLowerCase() ? [{ email: f.g_email, name: f.g_first ?? "" }] : []);
    const r = m ? await sendOne(to, m.subject, m.body, { tag: REPORT_TAG }).catch((e) => ({ ok: false, error: String(e) } as { ok: boolean; error?: string })) : { ok: false, error: "No approved report." };
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
