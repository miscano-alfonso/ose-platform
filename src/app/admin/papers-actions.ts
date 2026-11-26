"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { requireStaff, requireViewer } from "@/lib/auth";
import { saveSiteText } from "@/lib/site-content";
import { markingSubjects } from "@/app/(site)/other-services/past-paper-marking/subjects";
import * as P from "@/lib/past-papers";

// Past paper marking (26 Nov): the office on Admin → Workshops → Past paper marking, the teacher on Teacher → Marking.
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const back = (kind: "ok" | "err", m: string, anchor = "") => redirect(`/admin/workshops?tab=papers&${kind}=${encodeURIComponent(m)}${anchor}`);
const audit = (actor: string, action: string, id: string | null, detail: object = {}) => withSchool((q) => q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail)
  values (current_school(), $1, $2, 'marking_job', $3, $4)`, [actor, action, id, JSON.stringify(detail)])).catch(() => null);

/** Subjects (one row each, with their teacher) and the Pay now link. */
export async function savePaperSettingsAction(f: FormData) {
  const me = await requireStaff();
  const rows: { subject: string; teacher: string }[] = [];
  for (let i = 0; i < 60; i++) {
    if (!f.has(`subject_${i}`)) break;
    const subject = str(f, `subject_${i}`, 80).replace(/\s+/g, " ");
    if (subject && f.get(`remove_${i}`) !== "on") rows.push({ subject, teacher: str(f, `teacher_${i}`, 40) });
  }
  const pay = str(f, "marking_pay_url", 1200);
  if (pay && !/^https:\/\//.test(pay)) back("err", "The Pay now link must start with https://");
  const subjects = markingSubjects(rows.map((r) => r.subject).join("\n"));
  await saveSiteText(me.id, { marking_subjects: subjects.join("\n"), marking_pay_url: pay });
  await P.saveSubjectTeachers(Object.fromEntries(rows.filter((r) => isId(r.teacher)).map((r) => [r.subject, r.teacher])));
  revalidatePath("/other-services/past-paper-marking"); revalidatePath("/other-services");
  back("ok", "Saved. The website's form uses these subjects now.", "#settings");
}
export async function paperPaidAction(f: FormData) {
  const me = await requireStaff(); const id = str(f, "id", 40); if (!isId(id)) back("err", "Paper not found.");
  const ok = await P.markPaid(id, "office");
  await audit(me.id, "marking_paid", id);
  back(ok ? "ok" : "err", ok ? "Marked paid. The teacher has their 48 hours from now (the email to them goes out once test mode allows it)." : "It was already marked paid.", `#p-${id}`);
}
export async function paperUnpaidAction(f: FormData) {
  const me = await requireStaff(); const id = str(f, "id", 40); if (!isId(id)) back("err", "Paper not found.");
  await P.markUnpaid(id); await audit(me.id, "marking_unpaid", id);
  back("ok", "Set back to waiting for payment.", `#p-${id}`);
}
export async function paperTeacherAction(f: FormData) {
  const me = await requireStaff(); const id = str(f, "id", 40), t = str(f, "teacher", 40); if (!isId(id)) back("err", "Paper not found.");
  await P.setPaperTeacher(id, isId(t) ? t : null); await audit(me.id, "marking_teacher", id, { teacher: t || null });
  back("ok", "Teacher changed.", `#p-${id}`);
}
export async function paperEmailTeacherAction(f: FormData) {
  await requireStaff(); const id = str(f, "id", 40); if (!isId(id)) back("err", "Paper not found.");
  const ok = await P.emailTeacher(id);
  back(ok ? "ok" : "err", ok ? "Emailed the teacher again." : "Choose a teacher with an email first.", `#p-${id}`);
}
export async function paperCloseAction(f: FormData) {
  const me = await requireStaff(); const id = str(f, "id", 40); if (!isId(id)) back("err", "Paper not found.");
  const open = f.get("open") === "1";
  await withSchool((q) => q(`update enquiries set handled_at = ${open ? "null" : "now()"} where id = $1 and kind = 'marking'`, [id]));
  await audit(me.id, open ? "marking_reopen" : "marking_close", id);
  back("ok", open ? "Opened again." : "Closed. It stays in the list for 30 days.", `#p-${id}`);
}
export async function paperCheckStripeAction() {
  await requireStaff();
  const r = await P.paperPaymentsBackground(true);
  back(r.error ? "err" : "ok", r.error ? `Stripe: ${r.error}` : "Checked Stripe for new payments.");
}

// ---------- the teacher ----------
const tBack = (kind: "ok" | "err", m: string, id = "") => redirect(`/admin/teacher/marking?${kind}=${encodeURIComponent(m)}#${id ? `p-${id}` : "papers"}`);
export async function paperDelayAction(f: FormData) {
  const me = await requireViewer(); const id = str(f, "id", 40); if (!isId(id)) tBack("err", "Paper not found.");
  // the form sends London local time (datetime-local); turn it into an instant
  const local = str(f, "until", 20);
  const until = londonToIso(local);
  const err = await P.warnDelay(me.id, id, until ?? "", str(f, "reason", 400));
  if (err) tBack("err", err, id);
  await audit(me.id, "marking_delay", id, { until: local, by: me.viewing ? me.realEmail : undefined });
  tBack("ok", "Thanks: the parent and the office have been told the new time.", id);
}
export async function paperReturnAction(f: FormData) {
  const me = await requireViewer(); const id = str(f, "id", 40); if (!isId(id)) tBack("err", "Paper not found.");
  const file = f.get("marked");
  const err = await P.returnPaper(me.id, id, file instanceof File ? file : null, String(f.get("note") ?? ""));
  if (err) tBack("err", err, id);
  await audit(me.id, "marking_returned", id, { by: me.viewing ? me.realEmail : undefined });
  tBack("ok", "Sent back to the parent. Thank you!", id);
}
/** "2026-11-27T14:30" in London → ISO instant. */
function londonToIso(local: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) return null;
  const guess = new Date(local + ":00Z");
  const asLondon = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (asLondon.getTime() - asUtc.getTime())).toISOString();
}
