import "server-only";
import { withSchool } from "./db";

// What a customer school's OH-SO EdTech plan includes. OH-SO ED itself (and the demo school) has no plan: everything.
export type PlanId = "solo" | "growth" | "school";
export type SchoolPlan = { plan: PlanId | null; trialEndsAt: string | null; daysLeft: number | null; ended: boolean; students: number; teachers: number; classes: number };

/** Admin pages that aren't part of a plan (hidden from the menu, and shown as "not in your plan" if opened directly). */
const PLATFORM_ONLY = ["/admin/edtech", "/admin/home-ed", "/admin/styles"];
const NOT_IN: Record<PlanId, string[]> = {
  solo: [...PLATFORM_ONLY, "/admin/payroll", "/admin/staff", "/admin/jobs", "/admin/privacy", "/admin/reports", "/admin/student-chat", "/admin/rewards",
    "/admin/marketing", "/admin/newsletter", "/admin/subscribers", "/admin/email-stats", "/admin/social", "/admin/designs"],
  growth: [...PLATFORM_ONLY, "/admin/payroll", "/admin/jobs", "/admin/privacy"],
  school: [...PLATFORM_ONLY],
};
export const TEACHER_LIMIT: Record<PlanId, number> = { solo: 1, growth: 8, school: 1000 };
export const STUDENTS_INCLUDED: Record<PlanId, number> = { solo: 30, growth: 250, school: 600 };
export const PLAN_NAME: Record<PlanId, string> = { solo: "Solo", growth: "Growth", school: "School" };

export async function schoolPlan(): Promise<SchoolPlan> {
  const r = (await withSchool((q) => q<{ plan: PlanId | null; ends: string | null; students: number; teachers: number; classes: number }>(`select s.plan, s.trial_ends_at::text as ends,
      (select count(*)::int from students st where st.school_id = s.id and exists (select 1 from enrolments e where e.student_id = st.id and e.status = 'active')) as students,
      (select count(*)::int from teachers t where t.school_id = s.id and t.archived_at is null) as teachers,
      (select count(*)::int from course_groups g where g.school_id = s.id) as classes
    from schools s where s.id = current_school()`)).catch(() => []))[0];
  if (!r?.plan) return { plan: null, trialEndsAt: null, daysLeft: null, ended: false, students: r?.students ?? 0, teachers: r?.teachers ?? 0, classes: r?.classes ?? 0 };
  const ms = r.ends ? new Date(r.ends).getTime() - Date.now() : null;
  return { plan: r.plan, trialEndsAt: r.ends, daysLeft: ms == null ? null : Math.max(0, Math.ceil(ms / 864e5)), ended: ms != null && ms <= 0, students: r.students, teachers: r.teachers, classes: r.classes };
}

/** True when this admin page (or one under it) isn't in the plan. */
export function notInPlan(plan: PlanId | null, path: string): boolean {
  if (!plan) return false;
  return NOT_IN[plan].some((p) => path === p || path.startsWith(p + "/"));
}
