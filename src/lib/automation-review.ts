import "server-only";
import { createHash } from "node:crypto";
import { withSchool } from "./db";

// 27 Nov: Admin → Automations → Review & approve. Each automatic email is shown as the family (or teacher) will see it,
// filled in with example details, and can be approved or sent back with a note. An approval is for the exact wording,
// recipients and timing: change any of them and it needs approving again. Stored in meet_kv "automation_approvals".

export type Approval = { status: "approved" | "changes"; hash: string; by: string; at: string; note?: string };
const KEY = "automation_approvals";

export function wordingHash(r: { subject: string; body: string; to_parent: boolean; to_student: boolean; minutes: number | null }): string {
  return createHash("sha256").update(JSON.stringify([r.subject.trim(), r.body.trim(), r.to_parent, r.to_student, r.minutes])).digest("hex").slice(0, 16);
}

export async function approvals(): Promise<Record<string, Approval>> {
  const v = (await withSchool((q) => q<{ value: Record<string, Approval> }>(`select value from meet_kv where key = $1`, [KEY])))[0]?.value;
  return v && typeof v === "object" ? v : {};
}

export async function setApproval(key: string, a: Approval | null, actorId: string): Promise<void> {
  await withSchool(async (q) => {
    const cur = (await q<{ value: Record<string, Approval> }>(`select value from meet_kv where key = $1 for update`, [KEY]))[0]?.value ?? {};
    const next = { ...cur }; if (a) next[key] = a; else delete next[key];
    await q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2::jsonb) on conflict (school_id, key) do update set value = excluded.value`, [KEY, JSON.stringify(next)]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, $2, 'automation', null, $3)`,
      [actorId, a ? (a.status === "approved" ? "approve_email" : "email_changes_asked") : "unapprove_email", JSON.stringify({ key, note: a?.note })]);
  });
}

/** Where an automation stands: approved for its current wording, approved for older wording, changes asked, or not looked at. */
export function approvalState(a: Approval | undefined, hash: string): "approved" | "changed" | "changes" | "none" {
  if (!a) return "none";
  if (a.status === "changes") return a.hash === hash ? "changes" : "changed";
  return a.hash === hash ? "approved" : "changed";
}

/** Example details for the previews, per automation where the general ones wouldn't read right. */
export function sampleVars(key: string, school: string, base: string): Record<string, string> {
  const site = base.replace(/^https?:\/\//, "") || "dev.ohsoed.co.uk";
  const v: Record<string, string> = {
    parent: "Laura", child: "Sam", class: "Pre-GCSE History", date: "Thursday 3 December", time: "14:00", teacher: "Leanne",
    meet_link: "https://meet.google.com/abc-defg-hij", book_link: `${site}/courses`, taster_link: `${site}/taster`,
    join_link: `${site}/waitlist/join?t=…`, needed: "5", count: "2", hours: "48", amount: "£68.00", how: "collected by Direct Debit",
    payments_link: `${site}/parent/payments`, report: "Term 2 Progress Report", dashboard_link: `${site}/admin/teacher`, school,
    term: "Term 2", days: "14", courses: "• Sam: Pre-GCSE History\n• Sam: KS3 Maths",
    list: "• Essay: causes of WW1 (Pre-GCSE History) · 3 to mark · 2 days left\n• Source analysis (KS3 History) · 1 to mark · Due tomorrow",
  };
  if (key === "trial_waitlist_invite" || key === "waitlist_joined" || key === "waitlist_open" || key === "trial_opened") v.class = "Pre-GCSE Economics";
  if (key === "waitlist_open") v.book_link = `${site}/waitlist/book?w=…`;
  if (key === "marking_reminder") { v.count = "4 pieces of work"; v.teacher = "Leanne"; }
  if (key === "lesson_reminder") v.class = "Pre-GCSE History";
  // 27 Nov: the family automations for Classroom work, attendance and reward points
  if (key === "assignment_due" || key === "assignment_overdue") Object.assign(v, { name: "Laura", count: "2 pieces of work", assignments_link: `${site}/parent/assignments`,
    list: key === "assignment_due" ? "• Essay plan: causes of WW1 (Pre-GCSE History) · due Thursday 3 December at 16:00\n• Fractions practice (KS3 Maths) · due Friday 4 December at 09:00"
      : "• Essay plan: causes of WW1 (Pre-GCSE History) · was due Monday 30 November at 16:00\n• Fractions practice (KS3 Maths) · sent back to redo, was due Friday 27 November at 09:00" });
  if (key === "attendance_week") Object.assign(v, { week: "w/c Monday 30 November", attendance_link: `${site}/parent/attendance`,
    summary: "**Sam**: 3 of 4 lessons attended\n• Mon 30 Nov 09:30 · Pre-GCSE History · ✓ Present\n• Tue 01 Dec 14:00 · KS3 Maths · ✓ Late\n• Thu 03 Dec 09:30 · Pre-GCSE History · Absent (you told us)\n• Fri 04 Dec 14:00 · KS3 Maths · ✓ Present" });
  if (key === "reward_points") Object.assign(v, { name: "Laura", points: "5", total: "23", rewards_link: `${site}/parent`,
    list: "• +3 for “Helping a classmate” · Pre-GCSE History · Leanne Iacurci\n• +2 for “Brilliant effort” · KS3 Maths · Becky Randle" });
  if (key === "lesson_moved" || key === "lesson_cancelled") Object.assign(v, { class: "Pre-GCSE History", old_when: "Thursday 3 December at 14:00", new_when: "Friday 4 December at 11:30", reason: " Reason: Leanne is at a training day." });
  return v;
}
