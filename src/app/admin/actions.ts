"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { headers } from "next/headers";
import { parseImport, runImport, type ImportReport } from "@/lib/import";
import { buildSchedules, setFamilyTerm } from "@/lib/payments";
import { setLevelRate, buildPayRun, setAdjustment, setRunStatus } from "@/lib/payroll";
import { setTutorRate, addAvailability, removeAvailability, bookTutoring, setTutoringStatus } from "@/lib/tutoring";
import { addTeacher, saveTeacher, setTeacherArchived } from "@/lib/teachers-admin";
import { saveWorkshop } from "@/lib/workshops-admin";
import { audiences, recipients, sendBatch, logCampaign } from "@/lib/email";
import { replyThread, setThreadStatus, startThread, setHidden, dismissReport, officePost, setWords, setPrizes, confirmWinners, markWinner, givePoints } from "@/lib/community";
import { saveSiteText, saveFaq, deleteFaq, DEFAULTS, saveCoursePage, saveStyles } from "@/lib/site-content";
import { cleanStyles } from "@/lib/styles";
import { saveHubSection, addHubSection, deleteHubSection, saveHubLink, deleteHubLink } from "@/lib/hub";
import { saveBrandAsset, sniff, BRAND_TYPES } from "@/lib/brand";
import { createJob, saveJob, deleteJob, setApplication, deleteApplication, setAlertEmail, APP_STATUSES } from "@/lib/jobs";
import { saveRules, applyRules, copyRules, saveBundles, ensureSubject, addClass, saveNotice, saveCoupon, setCouponActive } from "@/lib/rules";
import { addYear, saveTerms, addHoliday, removeHoliday } from "@/lib/terms-admin";
import { createCycle, createEntries, reviewEntry, approveAllSubmitted, publishCycle, saveWriteSheet, type WriteInput } from "@/lib/reports";
import { ensureLessonDates, addSlot, removeSlot, setClassTeacher, makeLessonDates, saveRegister, cancelLesson, bookTaster, setTasterStatus } from "@/lib/ops";
import { markOneTaught, undoPoints, addMyHours, removeMyHours, teacherPost } from "@/lib/teacher-area";
import { requireViewer } from "@/lib/auth";
import { requireStaff, requireSignedIn, signIn, signOut, setUpFirstAdmin, changePassword, createInvite, acceptInvite, VIEWAS_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";
import { SCHOOL_COOKIE, siteSchool, schoolsFor } from "@/lib/db";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(_: unknown, f: FormData): Promise<{ error?: string; email?: string }> {
  const email = str(f, "email").toLowerCase(), password = String(f.get("password") ?? "").slice(0, 200);
  if (!EMAIL.test(email) || !password) return { error: "Enter your email and password.", email };
  const err = await signIn(email, password);
  if (err) return { error: err, email };
  redirect("/admin");
}

export async function setupAction(_: unknown, f: FormData): Promise<{ error?: string; name?: string; email?: string }> {
  const name = str(f, "name", 120), email = str(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "").slice(0, 200), confirm = String(f.get("confirm") ?? "").slice(0, 200);
  if (!name || !EMAIL.test(email)) return { error: "Enter your name and a valid email address.", name, email };
  if (password !== confirm) return { error: "The two passwords don’t match.", name, email };
  const err = await setUpFirstAdmin(String(f.get("key") ?? "").slice(0, 200), name, email, password);
  if (err) return { error: err, name, email };
  const signErr = await signIn(email, password);
  if (signErr) return { error: signErr, name, email };
  redirect("/admin");
}

export async function resetPasswordAction(_: unknown, f: FormData): Promise<{ error?: string; email?: string }> {
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "").slice(0, 200), confirm = String(f.get("confirm") ?? "").slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter your admin email address.", email };
  if (password !== confirm) return { error: "The two passwords don’t match.", email };
  const { resetAdminWithKey } = await import("@/lib/auth");
  const err = await resetAdminWithKey(String(f.get("key") ?? "").slice(0, 200), email, password);
  if (err) return { error: err, email };
  const signErr = await signIn(email, password);
  if (signErr) return { error: signErr, email };
  redirect("/admin");
}

export async function signOutAction() {
  await signOut();
  redirect("/admin/login");
}

export async function changePasswordAction(_: unknown, f: FormData): Promise<{ error?: string; ok?: boolean }> {
  const me = await requireSignedIn();
  const next = String(f.get("next") ?? "").slice(0, 200);
  if (next !== String(f.get("confirm") ?? "").slice(0, 200)) return { error: "The two new passwords don’t match." };
  const err = await changePassword(me.id, String(f.get("current") ?? "").slice(0, 200), next);
  return err ? { error: err } : { ok: true };
}

// ---------- classes ----------
const MODES = ["auto", "keep_open", "full"], LABELS = ["auto", "off", "few_spaces", "almost_full", "new_group", "launching_soon"],
  STATUSES = ["open", "waitlist", "priority", "closed", "hidden"], HOMEPAGE = ["auto", "show", "hide"];

export async function updateGroupAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40), capRaw = str(f, "capacity", 4);
  const capacity = capRaw === "" ? null : Math.max(1, Math.min(200, parseInt(capRaw, 10) || 0));
  const mode = str(f, "capacity_mode"), label = str(f, "sticky_label"), status = str(f, "status"), homepage = str(f, "homepage") || "auto";
  const orderRaw = str(f, "homepage_order", 3), homepageOrder = orderRaw === "" ? null : Math.max(1, Math.min(99, parseInt(orderRaw, 10) || 1));
  if (!MODES.includes(mode) || !LABELS.includes(label) || !STATUSES.includes(status) || !HOMEPAGE.includes(homepage)) return;
  const { cleanLessonLink } = await import("@/lib/video");
  const meet = cleanLessonLink(str(f, "meet_url", 500)); // Google Meet, Zoom, Teams, Whereby, Jitsi or any https link
  await withSchool(async (q) => {
    if (meet !== undefined) await q(`update course_groups set meet_url = $2 where id = $1`, [id, meet]);
    const before = await q(`select capacity, capacity_mode, sticky_label, status, homepage, homepage_order from course_groups where id = $1`, [id]);
    if (!before[0]) return;
    await q(`update course_groups set capacity = $2, capacity_mode = $3::capacity_mode, sticky_label = $4::sticky_label, status = $5::group_status, homepage = $6, homepage_order = $7 where id = $1`,
      [id, capacity, mode, label, status, homepage, homepageOrder]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'course_group', $2, $3)`,
      [me.id, id, JSON.stringify({ before: before[0], after: { capacity, capacity_mode: mode, sticky_label: label, status, homepage, homepage_order: homepageOrder } })]);
  });
  revalidatePath("/admin/classes"); revalidatePath("/admin"); revalidatePath("/courses"); revalidatePath("/");
}

// ---------- workshops ----------
export async function setWorkshopStatusAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40), status = str(f, "status");
  if (!["draft", "published", "cancelled", "completed"].includes(status)) return;
  await withSchool(async (q) => {
    await q(`update workshops set status = $2::workshop_status where id = $1`, [id, status]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'status', 'workshop', $2, $3)`,
      [me.id, id, JSON.stringify({ status })]);
  });
  revalidatePath("/admin/workshops"); revalidatePath("/other-services");
}

// ---------- enquiries ----------
export async function setEnquiryHandledAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40), handled = str(f, "handled") === "1";
  await withSchool(async (q) => {
    await q(`update enquiries set handled_at = case when $2 then now() else null end where id = $1`, [id, handled]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, $2, 'enquiry', $3)`,
      [me.id, handled ? "handled" : "reopened", id]);
  });
  revalidatePath("/admin/enquiries"); revalidatePath("/admin"); revalidatePath("/admin/tasters");
}

// ---------- staff ----------
export async function inviteAction(_: unknown, f: FormData): Promise<{ error?: string; link?: string; name?: string }> {
  const me = await requireStaff();
  const name = str(f, "name", 120), email = str(f, "email").toLowerCase(), role = str(f, "role");
  const teacherId = str(f, "teacher_id", 40) || null;
  if (!name || !EMAIL.test(email)) return { error: "Enter their name and a valid email address." };
  if (role !== "school_admin" && role !== "teacher") return { error: "Choose Admin or Teacher." };
  const r = await createInvite(me.id, name, email, role, role === "teacher" ? teacherId : null);
  if (r.error) return { error: r.error };
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "ose.miscano.co.uk";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  revalidatePath("/admin/staff");
  return { link: `${proto}://${host}/admin/invite/${r.token}`, name };
}

export async function acceptInviteAction(_: unknown, f: FormData): Promise<{ error?: string }> {
  const token = String(f.get("token") ?? "").slice(0, 100), password = String(f.get("password") ?? "").slice(0, 200);
  if (password !== String(f.get("confirm") ?? "").slice(0, 200)) return { error: "The two passwords don’t match." };
  const r = await acceptInvite(token, password);
  if (r.error) return { error: r.error };
  const err = await signIn(r.email!, password);
  if (err) return { error: err };
  redirect("/admin");
}

export async function revokeInviteAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40);
  await withSchool(async (q) => {
    await q(`update staff_invites set revoked_at = now() where id = $1 and accepted_at is null`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'invite_revoked', 'staff_invite', $2)`, [me.id, id]);
  });
  revalidatePath("/admin/staff");
}

export async function setStaffAccessAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40), on = str(f, "on") === "1";
  if (id === me.id) return;   // you can't switch off your own access
  await withSchool(async (q) => {
    await q(`update users set disabled_at = case when $2 then null else now() end where id = $1 and role in ('school_admin','teacher')`, [id, on]);
    if (!on) await q(`delete from staff_sessions where user_id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, $2, 'user', $3)`, [me.id, on ? "access_restored" : "access_removed", id]);
  });
  revalidatePath("/admin/staff");
}

// ---------- import ----------
export async function importAction(_: unknown, f: FormData): Promise<{ errors?: string[]; report?: ImportReport }> {
  const me = await requireStaff();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: ["Choose the import file first."] };
  if (file.size > 2_000_000) return { errors: ["That file is too big (2 MB limit)."] };
  const parsed = parseImport(await file.text());
  if (parsed.errors) return { errors: parsed.errors };
  try {
    const report = await runImport(parsed.data!, me.id);
    revalidatePath("/admin", "layout");
    return { report };
  } catch (e) {
    return { errors: [`Nothing was imported: ${(e as Error).message}`] };
  }
}

export async function setCheckAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40);
  await withSchool(async (q) => {
    await q(`update enrolments set needs_check = false where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'checked', 'enrolment', $2)`, [me.id, id]);
  });
  revalidatePath("/admin/families"); revalidatePath("/admin");
}

// ---------- payments ----------
export async function buildSchedulesAction(): Promise<void> {
  const me = await requireStaff();
  const rep = await buildSchedules(me.id);
  revalidatePath("/admin/payments");
  redirect(`/admin/payments?built=${rep.places}-${rep.instalments}-${rep.markedPaid}`);
}

export async function setFamilyTermAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const to = str(f, "to"), n = parseInt(str(f, "term", 2), 10);
  if (!["paid", "waived", "scheduled"].includes(to) || !(n >= 1 && n <= 6)) return;
  await setFamilyTerm(me.id, str(f, "parent", 40), n, to as "paid" | "waived" | "scheduled");
  revalidatePath("/admin/payments");
}

// ---------- timetable ----------
const back = (path: string, err: string | null, ok: string) => redirect(`${path}?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent(ok)}`);
export async function addSlotAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const day = parseInt(str(f, "weekday", 1), 10), start = str(f, "start", 5), mins = parseInt(str(f, "minutes", 3), 10) || 45;
  if (!(day >= 1 && day <= 7) || !/^\d{2}:\d{2}$/.test(start) || mins < 15 || mins > 180) return back("/admin/timetable-setup", "Pick a day, a start time and a length.", "");
  const err = await addSlot(me.id, str(f, "group", 40), day, start, mins, str(f, "teacher", 40) || null);
  if (!err) await ensureLessonDates().catch(() => 0);
  revalidatePath("/admin/timetable"); revalidatePath("/admin/timetable-setup"); revalidatePath("/timetable"); revalidatePath("/courses");
  back("/admin/timetable-setup", err, "Lesson time added.");
}
export async function removeSlotAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const note = await removeSlot(me.id, str(f, "id", 40));
  revalidatePath("/admin/timetable"); revalidatePath("/admin/timetable-setup"); revalidatePath("/timetable"); revalidatePath("/courses");
  back("/admin/timetable-setup", note, "Lesson time removed.");
}
export async function setClassTeacherAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const mins = Math.max(15, Math.min(180, parseInt(str(f, "minutes", 3), 10) || 45));
  const err = await setClassTeacher(me.id, str(f, "group", 40), str(f, "teacher", 40) || null, mins);
  revalidatePath("/admin/timetable"); revalidatePath("/admin/timetable-setup"); revalidatePath("/teachers"); revalidatePath("/courses");
  back("/admin/timetable-setup", err, "Class updated.");
}

// ---------- attendance ----------
export async function makeLessonDatesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const term = str(f, "term", 40);
  const n = await makeLessonDates(me.id, term);
  revalidatePath("/admin/attendance");
  redirect(`/admin/attendance?term=${term}&ok=${encodeURIComponent(n ? `${n} lesson dates added.` : "Lesson dates are up to date.")}`);
}
export async function saveRegisterAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const id = str(f, "id", 40), marks: Record<string, string> = {}, tasters: Record<string, string> = {};
  for (const [k, v] of f.entries()) {
    if (typeof v !== "string") continue;
    if (k.startsWith("m_")) marks[k.slice(2)] = v; else if (k.startsWith("t_")) tasters[k.slice(2)] = v;
  }
  const err = await saveRegister(me, id, marks, tasters, f.get("taught") === "on", str(f, "note", 300) || null);
  revalidatePath("/admin/attendance");
  redirect(`/admin/register/${id}?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent("Register saved.")}`);
}
export async function cancelLessonAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40);
  await cancelLesson(me.id, id, str(f, "note", 200));
  await import("@/lib/automations").then((a) => a.cancelLessonReminders(id)).catch(() => null);
  revalidatePath("/admin/attendance");
  redirect(`/admin/register/${id}?ok=${encodeURIComponent("Lesson cancelled. Any tasters booked into it were cancelled too.")}`);
}

// ---------- tasters ----------
export async function bookTasterAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const email = (k: string) => { const v = str(f, k, 120).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ""; };
  const d = { parentFirst: str(f, "pfirst", 60), parentLast: str(f, "plast", 60), parentEmail: email("pemail"), childName: str(f, "child", 80),
    childEmail: email("child_email"), message: str(f, "message", 300) || null, lessonId: str(f, "lesson", 40) };
  const group = str(f, "group", 40);
  if (!d.parentFirst || !d.parentLast || !d.parentEmail || !d.childName || !d.childEmail || !d.lessonId)
    redirect(`/admin/tasters?group=${group}&err=${encodeURIComponent("Fill in every field with valid emails.")}`);
  const err = await bookTaster(me.id, d);
  if (!err) await import("@/lib/automations").then((a) => a.runAutomations(20)).catch(() => null);
  revalidatePath("/admin/tasters");
  redirect(`/admin/tasters?${err ? `group=${group}&err=${encodeURIComponent(err)}` : "ok=" + encodeURIComponent(`Taster booked for ${d.childName}.`)}`);
}
export async function setTasterStatusAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await setTasterStatus(me.id, str(f, "id", 40), str(f, "status", 20));
  revalidatePath("/admin/tasters");
}

// ---------- payroll ----------
const pounds = (v: string) => { const n = Number(v.replace(/[£,\s]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const payBack = (err: string | null, ok: string) => redirect(`/admin/payroll?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent(ok)}`);
export async function setLevelRateAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const p = pounds(str(f, "rate", 12));
  if (!(p >= 0 && p <= 100000)) return payBack("Enter a rate in pounds, e.g. 45.", "");
  await setLevelRate(me.id, str(f, "level", 40), p);
  revalidatePath("/admin/payroll"); payBack(null, "Rate saved.");
}
export async function buildPayRunAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const err = await buildPayRun(me.id, str(f, "term", 40));
  revalidatePath("/admin/payroll"); payBack(err, "Pay run updated from the lessons taught.");
}
export async function setAdjustmentAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const raw = str(f, "amount", 12), p = raw === "" ? 0 : pounds(raw);
  if (!Number.isFinite(p) || Math.abs(p) > 1000000) return payBack("Enter the adjustment in pounds.", "");
  const err = await setAdjustment(me.id, str(f, "id", 40), p, str(f, "note", 120) || null);
  revalidatePath("/admin/payroll"); payBack(err, "Adjustment saved.");
}
export async function setRunStatusAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const to = str(f, "to", 10);
  if (!["approved", "paid", "draft"].includes(to)) return;
  await setRunStatus(me.id, str(f, "id", 40), to as "approved" | "paid" | "draft");
  revalidatePath("/admin/payroll"); payBack(null, to === "approved" ? "Pay run approved." : to === "paid" ? "Marked as paid." : "Back to draft.");
}

// ---------- reports ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export async function createCycleAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const d = { name: str(f, "name", 80), termId: str(f, "term", 40) || null, from: str(f, "from", 10), to: str(f, "to", 10), due: str(f, "due", 10), publish: str(f, "publish", 10) };
  if (!d.name || ![d.from, d.to, d.due, d.publish].every((x) => DATE.test(x)) || d.from > d.to) redirect(`/admin/reports?err=${encodeURIComponent("Give the report a name and all four dates (marks from must be before marks to).")}`);
  const err = await createCycle(me.id, d);
  revalidatePath("/admin/reports");
  redirect(`/admin/reports${err ? "?err=" + encodeURIComponent(err) : ""}`);
}
export async function createEntriesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), n = await createEntries(me.id, id);
  revalidatePath(`/admin/reports/${id}`);
  redirect(`/admin/reports/${id}?ok=${encodeURIComponent(n ? `${n} reports created. Teachers can start writing from their dashboard.` : "Everyone already has a report.")}`);
}
export async function reviewEntryAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const cycle = str(f, "cycle", 40);
  await reviewEntry(me.id, str(f, "id", 40), str(f, "approve", 1) === "1", str(f, "note", 300) || null);
  revalidatePath(`/admin/reports/${cycle}`);
}
export async function approveAllAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), n = await approveAllSubmitted(me.id, id);
  revalidatePath(`/admin/reports/${id}`);
  redirect(`/admin/reports/${id}?ok=${encodeURIComponent(`${n} approved.`)}`);
}
export async function publishCycleAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), err = await publishCycle(me.id, id);
  revalidatePath(`/admin/reports/${id}`); revalidatePath("/admin/reports");
  redirect(`/admin/reports/${id}?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent("Published. It will show in each family’s account once the parent area is live.")}`);
}
export async function saveWriteSheetAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const cycle = str(f, "cycle", 40), group = str(f, "group", 40);
  const n = (k: string, max: number) => { const v = parseInt(str(f, k, 2), 10); return v >= 1 && v <= max ? v : null; };
  const rows: WriteInput[] = f.getAll("ids").map(String).slice(0, 200).map((id) => ({ id, progress: n(`progress_${id}`, 5), effort: n(`effort_${id}`, 5),
    working: n(`working_${id}`, 9), predicted: n(`predicted_${id}`, 9), comment: str(f, `comment_${id}`, 2000), noAssessment: f.has(`noassess_${id}`) ? str(f, `noassess_${id}`, 200) : undefined }));
  const submit = str(f, "submit", 1) === "1";
  const err = await saveWriteSheet(me, cycle, group, rows, submit);
  revalidatePath(`/admin/reports/${cycle}`);
  redirect(`/admin/write/${cycle}/${group}?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent(submit ? "Submitted for approval." : "Drafts saved.")}`);
}

// ---------- 1:1 tutoring ----------
const tutBack = (err: string | null, ok: string) => redirect(`/admin/tutoring?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent(ok)}`);
export async function setTutorRateAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const price = pounds(str(f, "price", 12)), pay = pounds(str(f, "pay", 12)), aud = str(f, "audience", 10);
  if (!(price >= 0 && pay >= 0) || !["public", "enrolled"].includes(aud)) return tutBack("Enter both amounts in pounds.", "");
  await setTutorRate(me.id, str(f, "level", 40), aud, price, pay);
  revalidatePath("/admin/tutoring"); tutBack(null, "Price saved.");
}
export async function addAvailabilityAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const day = parseInt(str(f, "weekday", 1), 10), a = str(f, "start", 5), b = str(f, "end", 5);
  if (!(day >= 1 && day <= 7) || !/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(b) || b <= a) return tutBack("The end time must be after the start time.", "");
  await addAvailability(me.id, str(f, "teacher", 40), day, a, b);
  revalidatePath("/admin/tutoring"); tutBack(null, "Availability added.");
}
export async function removeAvailabilityAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await removeAvailability(me.id, str(f, "id", 40));
  revalidatePath("/admin/tutoring"); tutBack(null, "Availability removed.");
}
export async function bookTutoringAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const [teacherId, startsAt] = str(f, "slot", 120).split("|");
  const email = str(f, "student_email", 120).toLowerCase();
  const d = { parentId: str(f, "parent", 40), levelId: str(f, "level", 40), subjectId: str(f, "subject", 40), teacherId, startsAt, student: str(f, "student", 80),
    studentEmail: EMAIL.test(email) ? email : null, focus: str(f, "focus", 300) || null };
  if (!d.parentId || !d.student || !teacherId || !startsAt) return tutBack("Choose a time, a family and the student’s name.", "");
  const err = await bookTutoring(me.id, d);
  revalidatePath("/admin/tutoring"); tutBack(err, `1:1 booked for ${d.student}.`);
}
export async function setTutoringStatusAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await setTutoringStatus(me.id, str(f, "id", 40), str(f, "status", 12));
  revalidatePath("/admin/tutoring"); revalidatePath("/admin/payroll");
}

// ---------- teachers ----------
export async function addTeacherAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const name = str(f, "name", 80), email = str(f, "email", 120).toLowerCase();
  if (!name || !EMAIL.test(email)) redirect(`/admin/teachers?err=${encodeURIComponent("Enter the teacher’s name and email.")}`);
  const r = await addTeacher(me.id, name, email);
  revalidatePath("/admin/teachers");
  redirect(r.id ? `/admin/teachers/${r.id}?ok=${encodeURIComponent("Teacher added. Now fill in their profile.")}` : `/admin/teachers?err=${encodeURIComponent(r.error!)}`);
}
export async function saveTeacherAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), back = (k: string, m: string) => redirect(`/admin/teachers/${id}?${k}=${encodeURIComponent(m)}`);
  const file = f.get("photo");
  let photo: { data: Buffer; type: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return back("err", "The photo must be a JPG, PNG or WebP.");
    if (file.size > 3 * 1024 * 1024) return back("err", "The photo must be under 3 MB.");
    photo = { data: Buffer.from(await file.arrayBuffer()), type: file.type };
  }
  const name = str(f, "name", 80);
  if (!name) return back("err", "The teacher needs a name.");
  const err = await saveTeacher(me.id, id, { name, designation: str(f, "designation", 80), bio: String(f.get("bio") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 6000),
    qualifications: String(f.get("qualifications") ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 30).map((x) => x.slice(0, 150)),
    slug: str(f, "slug", 60), sortOrder: Math.max(0, Math.min(99, parseInt(str(f, "sort", 2), 10) || 0)),
    subjects: f.getAll("subjects").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)), photo, removePhoto: f.get("remove_photo") === "on" });
  revalidatePath("/admin/teachers"); revalidatePath("/teachers", "layout");
  back(err ? "err" : "ok", err ?? "Profile saved.");
}
export async function archiveTeacherAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40);
  await setTeacherArchived(me.id, id, str(f, "archive", 1) === "1");
  revalidatePath("/admin/teachers"); revalidatePath("/teachers", "layout");
  redirect(`/admin/teachers/${id}`);
}

// ---------- workshops: create and edit ----------
export async function saveWorkshopAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40) || null, back = (m: string) => redirect(`/admin/workshops/${id ?? "new"}?err=${encodeURIComponent(m)}`);
  const date = str(f, "date", 10), time = str(f, "time", 5), price = pounds(str(f, "price", 12) || "0"), pay = pounds(str(f, "pay", 12) || "0");
  const ep = str(f, "enrolled_price", 12), enrolledPrice = ep ? pounds(ep) : null;
  const cap = parseInt(str(f, "capacity", 4), 10);
  if (!str(f, "title", 120) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return back("Give the workshop a title, a date and a start time.");
  if (!(price >= 0) || !(pay >= 0) || (enrolledPrice != null && !(enrolledPrice >= 0))) return back("Enter prices in pounds, e.g. 15 or 0 for free.");
  const r = await saveWorkshop(me.id, id, { title: str(f, "title", 120), levelId: str(f, "level", 40) || null, subjectId: str(f, "subject", 40) || null,
    teacherId: str(f, "teacher", 40) || null, date, time, minutes: Math.max(15, Math.min(240, parseInt(str(f, "minutes", 3), 10) || 45)),
    capacity: cap > 0 ? Math.min(cap, 500) : null, price, enrolledPrice, teacherPay: pay, summary: str(f, "summary", 1000) || null, publish: f.get("publish") === "on" });
  revalidatePath("/admin/workshops"); revalidatePath("/other-services");
  if (r.error) return back(r.error);
  redirect(`/admin/workshops/${r.id}?ok=${encodeURIComponent("Workshop saved.")}`);
}

// ---------- email (Brevo) ----------
export async function sendEmailAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const kind = str(f, "kind", 12) === "marketing" ? "marketing" : "message", page = kind === "marketing" ? "/admin/marketing" : "/admin/email";
  const audience = kind === "marketing" ? "marketing" : str(f, "audience", 60), subject = str(f, "subject", 200), body = String(f.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000);
  if (!subject || !body || f.get("confirm") !== "on") redirect(`${page}?err=${encodeURIComponent("Add a subject and message, and tick the box to confirm.")}`);
  const label = kind === "marketing" ? "Marketing list" : (await audiences()).find((a) => a.value === audience)?.label;
  if (!label) redirect(`${page}?err=${encodeURIComponent("Choose who to send to.")}`);
  const to = await recipients(audience);
  const r = await sendBatch(subject, body, to, kind === "marketing");
  await logCampaign(me.id, { kind, audience, label: label!, subject, body, recipients: to.length, ...r });
  revalidatePath(page);
  redirect(`${page}?${r.failed ? "err=" + encodeURIComponent(`${r.sent} sent, ${r.failed} failed. ${r.error ?? ""}`) : "ok=" + encodeURIComponent(`Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}.`)}`);
}
export async function sendTestEmailAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const kind = str(f, "kind", 12) === "marketing" ? "marketing" : "message", page = kind === "marketing" ? "/admin/marketing" : "/admin/email";
  const subject = str(f, "subject", 200) || "(no subject)", body = String(f.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000) || "(empty message)";
  const r = await sendBatch(`[Test] ${subject}`, body, [{ name: me.name, email: me.email }], kind === "marketing");
  redirect(`${page}?${r.sent ? "ok=" + encodeURIComponent(`Test sent to ${me.email}.`) : "err=" + encodeURIComponent(r.error ?? "The test didn’t send.")}`);
}

// ---------- messages ----------
export async function replyThreadAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const id = str(f, "id", 40), body = String(f.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 5000);
  const err = body ? await replyThread(me, id, body, false) : "Write a message first.";
  revalidatePath("/admin/messages");
  redirect(`/admin/messages/${id}${err ? "?err=" + encodeURIComponent(err) : ""}`);
}
export async function setThreadStatusAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40);
  await setThreadStatus(me.id, id, str(f, "status", 6) === "closed" ? "closed" : "open");
  revalidatePath("/admin/messages"); redirect(`/admin/messages/${id}`);
}
export async function startThreadAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const subject = str(f, "subject", 120), body = String(f.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 5000);
  if (!subject || !body) redirect(`/admin/messages/new?err=${encodeURIComponent("Add a subject and a message.")}`);
  const r = await startThread(me.id, str(f, "student", 40), subject, body);
  redirect(r.id ? `/admin/messages/${r.id}` : `/admin/messages/new?err=${encodeURIComponent(r.error!)}`);
}

// ---------- student chat ----------
export async function hideChatMessageAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await setHidden(me.id, str(f, "id", 40), str(f, "hide", 1) === "1");
  revalidatePath("/admin/student-chat"); redirect(`/admin/student-chat?chat=${str(f, "chat", 40)}`);
}
export async function dismissReportAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await dismissReport(me.id, str(f, "id", 40)); revalidatePath("/admin/student-chat");
}
export async function officePostAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const chat = str(f, "chat", 40), err = await officePost(me.id, chat, str(f, "body", 1000));
  revalidatePath("/admin/student-chat"); redirect(`/admin/student-chat?chat=${chat}${err ? "&err=" + encodeURIComponent(err) : ""}`);
}
export async function setWordsAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const words = [...new Set(String(f.get("words") ?? "").split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean).map((w) => w.slice(0, 40)))].slice(0, 500);
  await setWords(me.id, words); revalidatePath("/admin/student-chat");
  redirect(`/admin/student-chat?ok=${encodeURIComponent(`${words.length} blocked words saved.`)}`);
}

// ---------- rewards ----------
export async function setPrizesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await setPrizes(me.id, [str(f, "p1", 120), str(f, "p2", 120), str(f, "p3", 120)]);
  revalidatePath("/admin/rewards"); redirect(`/admin/rewards?ok=${encodeURIComponent("Prizes saved.")}`);
}
export async function confirmWinnersAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const term = str(f, "term", 40), err = await confirmWinners(me.id, term);
  revalidatePath("/admin/rewards"); redirect(`/admin/rewards?term=${term}&${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent("Winners confirmed.")}`);
}
export async function markWinnerAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const field = str(f, "field", 20);
  if (field !== "parent_emailed_at" && field !== "gift_sent_at") return;
  await markWinner(me.id, str(f, "id", 40), field); revalidatePath("/admin/rewards");
}
export async function givePointsAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const pts = parseInt(str(f, "points", 2), 10), reason = str(f, "reason", 80);
  const err = !(pts >= 1 && pts <= 10) || !reason ? "Choose 1–10 points and give a reason." : await givePoints(me, str(f, "group", 40), str(f, "student", 40), pts, reason);
  revalidatePath("/admin/rewards"); revalidatePath("/admin/points");
  redirect(`/admin/points?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent(`+${pts} given.`)}`);
}

// ---------- website text ----------
export async function saveSiteTextAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const vals: Record<string, string> = {};
  for (const k of Object.keys(DEFAULTS)) vals[k] = String(f.get(k) ?? "").replace(/\r\n/g, "\n").slice(0, k === "about_text" ? 4000 : 1000);
  await saveSiteText(me.id, vals);
  revalidatePath("/", "layout"); redirect(`/admin/website?ok=${encodeURIComponent("Saved. The website shows the new text now.")}`);
}
export async function saveFaqAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40) || null, question = str(f, "question", 300), answer = String(f.get("answer") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 5000);
  if (!question || !answer) redirect("/admin/website");
  await saveFaq(me.id, id, { question, answer, sort: parseInt(str(f, "sort", 6), 10) || 0, published: f.get("published") === "on" });
  revalidatePath("/faq"); revalidatePath("/admin/website"); redirect(`/admin/website?ok=${encodeURIComponent(id ? "Question saved." : "Question added.")}`);
}
export async function deleteFaqAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await deleteFaq(me.id, str(f, "id", 40));
  revalidatePath("/faq"); revalidatePath("/admin/website"); redirect(`/admin/website?ok=${encodeURIComponent("Question deleted.")}`);
}

export async function saveCoursePageAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), raw = String(f.get("topics") ?? "").replace(/\r\n/g, "\n");
  const topics: { title: string; text: string }[] = [];
  for (const block of raw.split(/^## /m).map((b) => b.trim()).filter(Boolean)) {
    const [title, ...rest] = block.split("\n");
    topics.push({ title: title.trim().slice(0, 200), text: rest.join("\n").trim().slice(0, 4000) });
  }
  const video = str(f, "video", 500);
  await saveCoursePage(me.id, id, { board: str(f, "board", 60) || null, intro: str(f, "intro", 2000) || null, topics: topics.slice(0, 30), published: f.get("published") === "on",
    video: /^https:\/\/\S+$/.test(video) ? video : null, videoTitle: str(f, "video_title", 120) || null });
  revalidatePath("/courses", "layout"); revalidatePath("/admin/website");
  redirect(`/admin/website/courses/${id}?ok=${encodeURIComponent("Saved.")}`);
}

// ---------- prices & rules ----------
const priceBack = (year: string, k: string, m: string) => redirect(`/admin/prices?year=${year}&${k}=${encodeURIComponent(m)}`);
export async function saveRulesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40);
  const int = (k: string, lo: number, hi: number, d: number) => { const v = parseInt(str(f, k, 3), 10); return v >= lo && v <= hi ? v : d; };
  const levels = f.getAll("level").map(String).map((id) => {
    const c = str(f, `cost_${id}`, 12), fee = pounds(str(f, `fee_${id}`, 12) || "0");
    return { level_id: id, cost: c === "" ? null : pounds(c), fee: fee >= 0 ? fee : 0, tpy: int(`tpy_${id}`, 1, 6, 6), fyt: int(`fyt_${id}`, 1, 6, 6) };
  });
  if (levels.some((l) => l.cost != null && !(l.cost >= 0 && l.cost < 100000))) return priceBack(year, "err", "Enter each price per lesson in pounds, e.g. 8 or 12.50.");
  const subjects = f.getAll("rule").map(String).map((k) => { const [level_id, subject_id] = k.split("_");
    return { level_id, subject_id, lpw: int(`lpw_${k}`, 1, 5, 1), years: int(`yrs_${k}`, 1, 3, 1), remove: f.get(`del_${k}`) === "on" }; });
  const nl = str(f, "new_level", 40), nn = str(f, "new_subject_name", 60).replace(/\s+/g, " ");
  const ns = nn ? await ensureSubject(me.id, nn) : str(f, "new_subject", 40);
  if (nn && !nl) return priceBack(year, "err", "Choose the level for the new subject.");
  if (nl && ns) subjects.push({ level_id: nl, subject_id: ns, lpw: int("new_lpw", 1, 5, 1), years: int("new_yrs", 1, 3, 1), remove: false });
  await saveRules(me.id, year, levels, subjects);
  revalidatePath("/admin/prices"); priceBack(year, "ok", "Rules saved. Check the prices below, then press Apply.");
}
export async function applyRulesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40);
  if (f.get("confirm") !== "on") return priceBack(year, "err", "Tick the box to confirm.");
  const n = await applyRules(me.id, year);
  revalidatePath("/", "layout"); priceBack(year, "ok", `Prices updated${n ? ` and ${n} class${n === 1 ? "" : "es"} moved to the right price plan` : ""}.`);
}
export async function copyRulesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const to = str(f, "to", 40);
  await copyRules(me.id, str(f, "from", 40), to);
  revalidatePath("/admin/prices"); priceBack(to, "ok", "Rules copied. Adjust them, save, then Apply.");
}
export async function saveBundlesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40), rows: { min: number; pct: number }[] = [];
  for (const i of [0, 1, 2]) { const m = parseInt(str(f, `min_${i}`, 2), 10), p = Number(str(f, `pct_${i}`, 6)); if (m >= 2 && p > 0 && p < 100) rows.push({ min: m, pct: p }); }
  if (new Set(rows.map((r) => r.min)).size !== rows.length) return priceBack(year, "err", "Each discount needs a different number of courses.");
  await saveBundles(me.id, year, rows);
  revalidatePath("/", "layout"); priceBack(year, "ok", "Discounts saved.");
}

export async function saveNoticeAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40);
  const rows = f.getAll("level").map((v) => String(v)).filter((id) => /^[0-9a-f-]{36}$/.test(id)).map((id) => ({ level_id: id, terms: parseInt(str(f, `notice_${id}`, 1), 10) || 0 }));
  await saveNotice(me.id, rows);
  priceBack(year, "ok", "Notice periods saved. New bookings use them; existing bookings keep theirs.");
}
export async function saveCouponAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40);
  const pct = str(f, "pct", 6) ? Number(str(f, "pct", 6)) : null, amt = str(f, "amount", 8) ? Math.round(Number(str(f, "amount", 8)) * 100) : null;
  const date = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(str(f, k, 10)) ? str(f, k, 10) : null;
  const err = await saveCoupon(me.id, { code: str(f, "code", 30).toUpperCase().replace(/\s+/g, ""), pct: pct && pct > 0 ? pct : null, amount: amt && amt > 0 ? amt : null, from: date("from"), to: date("to"), max: parseInt(str(f, "max", 5), 10) || null });
  priceBack(year, err ? "err" : "ok", err ?? "Coupon added. Parents can use it at checkout.");
}
export async function toggleCouponAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await setCouponActive(me.id, str(f, "id", 40), str(f, "active", 5) === "1");
  priceBack(str(f, "year", 40), "ok", "Coupon updated.");
}

export async function addClassAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const [yearId, levelId, subjectId] = str(f, "course", 120).split("|");
  const status = ["hidden", "open", "waitlist"].includes(str(f, "status", 10)) ? str(f, "status", 10) : "hidden";
  const capacity = Math.max(1, Math.min(200, parseInt(str(f, "capacity", 3), 10) || 12));
  if (!yearId || !levelId || !subjectId) redirect(`/admin/classes?err=${encodeURIComponent("Choose a course.")}`);
  const r = await addClass(me.id, { yearId, levelId, subjectId, capacity, status });
  revalidatePath("/admin/classes"); revalidatePath("/courses", "layout");
  redirect(`/admin/classes?${r.error ? "err=" + encodeURIComponent(r.error) : "ok=" + encodeURIComponent(`Class ${r.code} added. Add its lesson times and teacher under Timetable.`)}`);
}

// ---------- term dates ----------
const termBack = (year: string | null, k: string, m: string) => redirect(`/admin/term-dates?${year ? `year=${year}&` : ""}${k}=${encodeURIComponent(m)}`);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export async function addYearAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const d = { label: str(f, "label", 7), starts: str(f, "starts", 10), ends: str(f, "ends", 10), sales: str(f, "sales", 10) };
  if (!/^\d{4}\/\d{2}$/.test(d.label) || ![d.starts, d.ends, d.sales].every((x) => ISO.test(x)) || d.ends <= d.starts) return termBack(null, "err", "Give the year a name like 2027/28 and valid dates.");
  const r = await addYear(me.id, d);
  revalidatePath("/admin/term-dates");
  termBack(r.id ?? null, r.error ? "err" : "ok", r.error ?? "Year added. Now add its six terms.");
}
export async function saveTermsAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40), rows = [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, starts: str(f, `s_${n}`, 10), ends: str(f, `e_${n}`, 10), bills: str(f, `b_${n}`, 10) }));
  if (rows.some((r) => !ISO.test(r.starts) || !ISO.test(r.ends) || !ISO.test(r.bills) || r.ends < r.starts)) return termBack(year, "err", "Every term needs a first and last day (last after first) and a payment date.");
  if (rows.some((r, i) => i > 0 && r.starts <= rows[i - 1].ends)) return termBack(year, "err", "Each term must start after the previous one ends.");
  const r = await saveTerms(me.id, year, rows);
  if (!r.error) await ensureLessonDates().catch(() => 0);
  revalidatePath("/", "layout");
  termBack(year, r.error ? "err" : "ok", r.error ?? `Term dates saved and this year’s prices updated${r.moved ? ` (${r.moved} classes moved plan)` : ""}.`);
}
export async function addHolidayAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40) || null, s1 = str(f, "starts", 10), e1 = str(f, "ends", 10);
  if (!ISO.test(s1) || !ISO.test(e1) || e1 < s1) return termBack(year, "err", "Check the holiday dates.");
  await addHoliday(me.id, str(f, "name", 80), s1, e1); await ensureLessonDates().catch(() => 0); revalidatePath("/admin/term-dates"); termBack(year, "ok", "Holiday added.");
}
export async function removeHolidayAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await removeHoliday(me.id, str(f, "id", 40)); await ensureLessonDates().catch(() => 0); revalidatePath("/admin/term-dates"); termBack(str(f, "year", 40) || null, "ok", "Holiday removed.");
}

export async function saveStylesAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  let raw: unknown = null;
  try { raw = JSON.parse(String(f.get("styles") ?? "")); } catch { /* treated as empty */ }
  const kind = f.get("kind") === "dash" ? "dash" : "site";
  await saveStyles(me.id, cleanStyles(raw, kind), kind);
  revalidatePath("/", "layout");
  redirect(`/admin/styles?${kind === "dash" ? "tab=dash&" : ""}ok=${encodeURIComponent(kind === "dash" ? "Saved. The dashboards use the new styles now." : "Saved. The website uses the new sizes now.")}`);
}

// ---- 'New to Home Ed?' hub ----
const hubBack = (msg: string, section?: string, err = false) =>
  redirect(`/admin/home-ed?${err ? "err" : "ok"}=${encodeURIComponent(msg)}${section ? `&s=${section}#s-${section}` : ""}`);
const hubDone = () => { revalidatePath("/home-ed"); revalidatePath("/admin/home-ed"); };

export async function saveHubSectionAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), title = str(f, "title", 120);
  if (!title) hubBack("A section needs a heading.", id, true);
  await saveHubSection(me.id, id, { title, intro: String(f.get("intro") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000), sort: parseInt(str(f, "sort", 6), 10) || 0, published: f.get("published") === "on" });
  hubDone(); hubBack("Section saved.", id);
}
export async function addHubSectionAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const title = str(f, "title", 120); if (!title) hubBack("A section needs a heading.", undefined, true);
  const id = await addHubSection(me.id, title);
  hubDone(); hubBack("Section added. Now add its links.", id);
}
export async function deleteHubSectionAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  if (f.get("confirm") !== "on") hubBack("Tick the box to confirm.", undefined, true);
  await deleteHubSection(me.id, str(f, "id", 40));
  hubDone(); hubBack("Section deleted.");
}
export async function saveHubLinkAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40) || null, section = str(f, "section", 40);
  const kind = (["link", "video", "date"] as const).find((k) => k === str(f, "kind", 10)) ?? "link";
  const title = str(f, "title", 200), url = str(f, "url", 1000);
  if (!title) hubBack("A link needs a title.", section, true);
  if (url && !/^https:\/\/[^\s]+\.[^\s]+$/.test(url)) hubBack("Links must start with https://", section, true);
  if (!url && kind !== "date") hubBack("Add the web address, or choose the Date type.", section, true);
  await saveHubLink(me.id, id, section, { kind, title, url, grp: str(f, "grp", 80), description: String(f.get("description") ?? "").replace(/\s+/g, " ").trim().slice(0, 1000),
    sort: parseInt(str(f, "sort", 6), 10), published: f.get("published") === "on" });
  hubDone(); hubBack(id ? "Link saved." : "Link added.", section);
}
export async function deleteHubLinkAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await deleteHubLink(me.id, str(f, "id", 40));
  hubDone(); hubBack("Link deleted.", str(f, "section", 40));
}

// ---- Logo and browser icon ----
export async function saveBrandAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const kind = str(f, "kind", 10) === "icon" ? "icon" : "logo";
  const back = (k: "ok" | "err", m: string) => redirect(`/admin/website?${k}=${encodeURIComponent(m)}#brand`);
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) back("err", "Choose an image file first.");
  const fl = file as File;
  const max = kind === "logo" ? 1024 * 1024 : 512 * 1024;
  if (fl.size > max) back("err", `The ${kind === "logo" ? "logo must be under 1 MB" : "icon must be under 512 KB"}.`);
  const data = Buffer.from(await fl.arrayBuffer());
  const mime = sniff(data);
  if (!mime || !BRAND_TYPES.includes(mime)) back("err", "That file isn't a PNG, SVG, WebP or JPG image.");
  await saveBrandAsset(me.id, kind, { mime: mime!, data });
  revalidatePath("/", "layout");
  back("ok", kind === "logo" ? "New logo saved. It's on the website and admin now." : "New browser icon saved. Browsers can take a few minutes to show it.");
}
export async function resetBrandAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const kind = str(f, "kind", 10) === "icon" ? "icon" : "logo";
  await saveBrandAsset(me.id, kind, null);
  revalidatePath("/", "layout");
  redirect(`/admin/website?ok=${encodeURIComponent(kind === "logo" ? "Back to the original logo." : "Back to the original icon.")}#brand`);
}

// ---- Jobs ----
const jobsBack = (path: string, k: "ok" | "err", m: string) => redirect(`${path}?${k}=${encodeURIComponent(m)}`);
const jobsDone = () => { revalidatePath("/jobs", "layout"); revalidatePath("/admin/jobs", "layout"); };
export async function createJobAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const title = str(f, "title", 160); if (!title) jobsBack("/admin/jobs", "err", "Give the vacancy a title.");
  const id = await createJob(me.id, title);
  jobsDone(); jobsBack(`/admin/jobs/${id}`, "ok", "Vacancy added as a draft. Fill in the details, then set it to Open.");
}
export async function saveJobAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), path = `/admin/jobs/${id}`;
  const title = str(f, "title", 160); if (!title) jobsBack(path, "err", "The vacancy needs a title.");
  const status = (["draft", "open", "closed"] as const).find((s) => s === str(f, "status", 10)) ?? "draft";
  const closes = str(f, "closes_on", 10);
  if (closes && !/^\d{4}-\d{2}-\d{2}$/.test(closes)) jobsBack(path, "err", "The closing date isn't a valid date.");
  const text = (k: string, max: number) => String(f.get(k) ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
  await saveJob(me.id, id, { title, status, closes_on: closes || null, subjects: str(f, "subjects", 200), location: str(f, "location", 120) || "Remote (online)",
    hours: str(f, "hours", 120), pay: str(f, "pay", 120), summary: text("summary", 400), description: text("description", 12000) });
  jobsDone(); jobsBack(path, "ok", status === "open" ? "Saved. The vacancy is on the website." : "Saved.");
}
export async function deleteJobAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  if (f.get("confirm") !== "on") jobsBack("/admin/jobs", "err", "Tick the box to confirm.");
  await deleteJob(me.id, str(f, "id", 40));
  jobsDone(); jobsBack("/admin/jobs", "ok", "Vacancy deleted.");
}
export async function saveApplicationAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const id = str(f, "id", 40), status = APP_STATUSES.find(([k]) => k === str(f, "status", 20))?.[0] ?? "new";
  await setApplication(me.id, id, status, String(f.get("notes") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000));
  jobsDone(); jobsBack(`/admin/jobs/application/${id}`, "ok", "Saved.");
}
export async function deleteApplicationAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const job = str(f, "job", 40);
  if (f.get("confirm") !== "on") jobsBack(`/admin/jobs/${job}`, "err", "Tick the box to confirm.");
  await deleteApplication(me.id, str(f, "id", 40));
  jobsDone(); jobsBack(`/admin/jobs/${job}`, "ok", "Application deleted.");
}
export async function saveAlertEmailAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const email = str(f, "email", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) jobsBack("/admin/jobs", "err", "That email address doesn't look right.");
  await setAlertEmail(me.id, email);
  jobsBack("/admin/jobs", "ok", email ? `Alerts will go to ${email}.` : "Application alerts turned off.");
}

// ---------- the School and "Viewing as" switchers in the admin sidebar ----------
export async function setSchoolAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const slug = str(f, "school", 40);
  if (!(await schoolsFor(me.email)).some((x) => x.slug === slug)) redirect("/admin");
  const jar = await cookies();
  jar.delete({ name: VIEWAS_COOKIE, path: "/admin" });
  if (slug === siteSchool()) { jar.delete({ name: SCHOOL_COOKIE, path: "/admin" }); jar.delete({ name: SCHOOL_COOKIE + "_p", path: "/parent" }); jar.delete({ name: SCHOOL_COOKIE + "_s", path: "/student" }); }
  else jar.set(SCHOOL_COOKIE, slug, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: 30 * 86400 });
  // the demo school needs no separate sign-in: an admin of this school goes straight in
  if (slug !== siteSchool()) { const { enterDemo } = await import("@/lib/auth"); const { runAsSchool } = await import("@/lib/db"); await runAsSchool(slug, () => enterDemo(me)); }
  redirect("/admin"); // each school has its own staff accounts: sign in there if you aren't already
}
export async function setViewAsAction(f: FormData): Promise<void> {
  await requireStaff();
  const v = str(f, "as", 60), jar = await cookies();
  if (v === "p" || v === "s") redirect(`/admin/view-as?kind=${v}`);
  if (v.startsWith("t:") && /^t:[0-9a-f-]{36}$/.test(v)) {
    jar.set(VIEWAS_COOKIE, v, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: 8 * 3600 });
    redirect("/admin/teacher");
  }
  jar.delete({ name: VIEWAS_COOKIE, path: "/admin" });
  redirect("/admin");
}
export async function stopViewingAction(): Promise<void> {
  (await cookies()).delete({ name: VIEWAS_COOKIE, path: "/admin" });
  redirect("/admin");
}
export async function saveSchoolAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const name = str(f, "name", 80), legal = str(f, "legal", 120), hex = (k: string, d: string) => /^#[0-9a-f]{6}$/i.test(str(f, k, 7)) ? str(f, k, 7) : d;
  if (!name) redirect(`/admin/school?err=${encodeURIComponent("The school needs a name.")}`);
  await withSchool(async (q) => {
    await q(`update schools set name = $1, legal_name = nullif($2, ''), brand = brand || jsonb_build_object('primary', $3::text, 'accent', $4::text) where id = current_school()`, [name, legal, hex("primary", "#0f1747"), hex("accent", "#e3cd4b")]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'update', 'school', $2)`, [me.id, JSON.stringify({ name })]);
  });
  revalidatePath("/admin", "layout"); redirect(`/admin/school?ok=${encodeURIComponent("Saved.")}`);
}

// ---------- the teacher's own area (also used by an admin viewing as that teacher; the audit records the admin) ----------
const tback = (path: string, ok?: string | null, err?: string | null) => redirect(path + (err ? `?err=${encodeURIComponent(err)}` : ok ? `?ok=${encodeURIComponent(ok)}` : ""));
export async function markOneTaughtAction(f: FormData): Promise<void> {
  const [me, real] = await Promise.all([requireViewer(), requireSignedIn()]);
  const err = await markOneTaught(me.id, str(f, "id", 40), real.id);
  tback("/admin/teacher/ones", "Marked as taught. It’s paid with your lessons.", err);
}
export async function addMyHoursAction(f: FormData): Promise<void> {
  const [me, real] = await Promise.all([requireViewer(), requireSignedIn()]);
  const err = await addMyHours(me.id, Number(str(f, "weekday", 2)), str(f, "from", 5), str(f, "to", 5), real.id);
  tback("/admin/teacher/ones", "1:1 hours updated.", err);
}
export async function removeMyHoursAction(f: FormData): Promise<void> {
  const [me, real] = await Promise.all([requireViewer(), requireSignedIn()]);
  await removeMyHours(me.id, str(f, "id", 40), real.id);
  tback("/admin/teacher/ones", "1:1 hours updated.");
}
export async function teacherPostAction(f: FormData): Promise<void> {
  const me = await requireViewer();
  const chat = str(f, "chat", 40), body = str(f, "body", 1000);
  const err = me.viewing ? "While viewing as a teacher you can read their chats but not post as them." : body ? await teacherPost(me.id, chat, body) : "Write a message first.";
  redirect(`/admin/teacher/chats?c=${chat}${err ? `&err=${encodeURIComponent(err)}` : ""}`);
}
export async function undoPointsAction(f: FormData): Promise<void> {
  const [me, real] = await Promise.all([requireViewer(), requireSignedIn()]);
  const err = await undoPoints(me.id, str(f, "id", 40), real.id);
  tback("/admin/points", "Points taken back.", err);
}

// ---------- attendance from Google Meet ----------
const attBack = (tab: string, ok?: string | null, err?: string | null) => redirect(`/admin/attendance?tab=${tab}` + (err ? `&err=${encodeURIComponent(err)}` : ok ? `&ok=${encodeURIComponent(ok)}` : ""));
export async function saveGoogleAppAction(f: FormData): Promise<void> {
  await requireStaff();
  const { saveApp, MeetError } = await import("@/lib/meet");
  let err: string | null = null;
  try { await saveApp(str(f, "client_id", 200), str(f, "client_secret", 200)); } catch (e) { err = e instanceof MeetError ? e.message : "Couldn’t save that."; }
  attBack("google", "Saved. Now press Connect Google.", err);
}
export async function disconnectGoogleAction(f: FormData): Promise<void> {
  await requireStaff();
  const { disconnect } = await import("@/lib/meet");
  await disconnect(str(f, "forget", 3) === "1");
  attBack("google", "Google disconnected. Attendance already taken is kept.");
}
export async function syncMeetAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { syncMeet, MeetError } = await import("@/lib/meet");
  const from = str(f, "from", 10);
  let ok: string | null = null, err: string | null = null;
  try {
    const r = await syncMeet(me.name, /^\d{4}-\d\d-\d\d$/.test(from) ? from : undefined);
    if (r.error) err = r.error; else ok = `Synced: Google reported ${r.fetched ?? 0} Meet join${r.fetched === 1 ? "" : "s"}, ${r.placed ?? 0} fitted a lesson, ${r.joins} new${r.unmatched ? `; ${r.unmatched} to check` : ""}.${(r.fetched ?? 0) > (r.placed ?? 0) ? " See “Meet calls not matched to a class” below." : ""}`;
  } catch (e) { err = e instanceof MeetError ? e.message : "Couldn’t sync with Google. Try again."; console.error("meet sync", e); }
  attBack(str(f, "tab", 20) || "students", ok, err);
}
export async function saveAlertAction(f: FormData): Promise<void> {
  await requireStaff();
  const { saveAlert } = await import("@/lib/meet");
  await saveAlert(f.get("on") === "on", Number(str(f, "pct", 3)));
  attBack(str(f, "tab", 20) || "students", "Weekly alert saved.");
}
export async function matchJoinAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { matchJoin } = await import("@/lib/meet");
  const sid = str(f, "student", 40);
  const err = await matchJoin(me.id, str(f, "id", 40), f.get("ignore") ? null : sid || null);
  attBack("joins", f.get("ignore") ? "Marked as not a student." : "Matched. Their attendance is updated.", err);
}

// ---------- families (the prototype's family drawer, as a page) ----------
const famBack = (id: string, ok?: string | null, err?: string | null) => redirect(`/admin/families/${id}` + (err ? `?err=${encodeURIComponent(err)}` : ok ? `?ok=${encodeURIComponent(ok)}` : ""));
export async function cancelCourseAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { cancelCourse } = await import("@/lib/families");
  const waive = f.get("waive") === "1";
  const err = await cancelCourse(me.id, str(f, "id", 40), waive, str(f, "reason", 200) || null);
  revalidatePath("/admin/payments");
  famBack(str(f, "family", 40), waive ? "Cancelled and notice waived: no more payments." : "Cancelled. Notice given: lessons and payments run to the end of the notice period.", err);
}
export async function swapCourseAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { swapCourse } = await import("@/lib/families");
  const start = str(f, "start", 8) === "next" ? "next" : "current";
  const err = await swapCourse(me.id, str(f, "id", 40), str(f, "to", 40), start);
  revalidatePath("/admin/payments");
  famBack(str(f, "family", 40), start === "next" ? "Swap booked: the new class starts next term." : "Swapped: the child moves now; this term is re-priced.", err);
}
export async function familyTermAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const to = str(f, "to"), n = parseInt(str(f, "term", 2), 10), fam = str(f, "parent", 40);
  if (["paid", "waived", "scheduled"].includes(to) && n >= 1 && n <= 6) await setFamilyTerm(me.id, fam, n, to as "paid" | "waived" | "scheduled");
  revalidatePath("/admin/payments");
  famBack(fam, `Term ${n} updated.`);
}
export async function familyCheckAction(f: FormData): Promise<void> {
  await setCheckAction(f);
  famBack(str(f, "family", 40), "Marked as checked.");
}
export async function stopContactAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { stopContact } = await import("@/lib/families");
  await stopContact(me.id, str(f, "id", 40));
  redirect("/admin/families?ok=" + encodeURIComponent("Sharing stopped."));
}
export async function tasterFollowUpAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { tasterFollowUp } = await import("@/lib/ops");
  const err = await tasterFollowUp(me.id, str(f, "id", 40));
  redirect(`/admin/tasters?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent("Follow-up email sent.")}`);
}
export async function remindInviteAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { remindInvite } = await import("@/lib/admin-data");
  const err = await remindInvite(me.id, str(f, "id", 40));
  redirect(`/admin/classes?${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent("Reminder sent to the student and parent.")}`);
}
export async function runInvitesAction(): Promise<void> {
  const me = await requireStaff();
  const { runInvites } = await import("@/lib/classroom-invites");
  const r = await runInvites(me.name);
  const ok = `Classroom: ${r.invited ?? 0} invitation${r.invited === 1 ? "" : "s"} sent, ${r.removed ?? 0} taken out.${r.problems?.length ? ` ${r.problems.length} couldn’t be done (see below).` : ""}`;
  redirect(`/admin/classes?${r.error ? "err=" + encodeURIComponent(r.error) : "ok=" + encodeURIComponent(ok)}`);
}
export async function saveInviteCfgAction(f: FormData): Promise<void> {
  await requireStaff();
  const { saveInviteCfg } = await import("@/lib/classroom-invites");
  const auto = f.get("auto") === "on";
  await saveInviteCfg(auto);
  redirect(`/admin/classes?ok=${encodeURIComponent(auto ? "Classroom invitations now go out automatically, about every hour." : "Automatic Classroom invitations are off. Use Send now when you’re ready.")}`);
}
export async function saveBandAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { saveBand } = await import("@/lib/reports");
  const err = await saveBand(me.id, Number(str(f, "score", 1)), Number(str(f, "min", 5)));
  const c = str(f, "cycle", 40);
  redirect(`/admin/reports${c ? `/${c}` : ""}?tab=key&${err ? "err=" + encodeURIComponent(err) : "ok=" + encodeURIComponent("Grading key saved.")}`);
}
export async function remindTeachersAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { remindTeachers } = await import("@/lib/reports");
  const c = str(f, "cycle", 40), r = await remindTeachers(me.id, c);
  redirect(`/admin/reports/${c}?tab=classes&${r.sent ? "ok=" + encodeURIComponent(`Reminder sent to ${r.sent} teacher${r.sent === 1 ? "" : "s"}.`) : "err=" + encodeURIComponent(r.error ?? "Nobody has comments left to write.")}`);
}

// ---------- data protection ----------
const dpBack = (tab: string, ok?: string | null, err?: string | null) => redirect(`/admin/privacy?tab=${tab}` + (err ? `&err=${encodeURIComponent(err)}` : ok ? `&ok=${encodeURIComponent(ok)}` : ""));
export async function addPrivReqAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  const fam = str(f, "family", 40);
  const err = await P.addRequest(me.id, /^[0-9a-f-]{36}$/.test(fam) ? fam : null, str(f, "email", 200), str(f, "kind", 20), str(f, "detail", 500) || null);
  dpBack("requests", "Request recorded. Reply within one month.", err);
}
export async function closePrivReqAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  await P.closeRequest(me.id, str(f, "id", 40), str(f, "status", 10) === "refused" ? "refused" : "done", str(f, "outcome", 300) || null);
  dpBack("requests", "Request closed.");
}
export async function eraseFamilyAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  if (str(f, "confirm", 10) !== "ERASE") dpBack("requests", null, "Type ERASE to confirm.");
  const err = await P.eraseFamily(me.id, str(f, "id", 40));
  dpBack("requests", "Family erased. Payment records are kept without names for six years.", err);
}
export async function runRetentionAction(): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  const n = await P.runRetentionNow(me.id);
  dpBack("retention", n ? `Clean-up done: ${n} record${n === 1 ? "" : "s"} past their retention period removed.` : "Clean-up done: nothing past its retention period.");
}
export async function setRetentionAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  await P.setRetention(me.id, str(f, "kind", 40), Number(str(f, "months", 4)));
  dpBack("retention", "Retention saved.");
}
export async function addBreachAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  const risk = str(f, "risk", 12), n = parseInt(str(f, "people", 6), 10);
  const err = await P.addBreach(me.id, str(f, "what", 500), str(f, "data", 300), risk, Number.isFinite(n) ? n : null);
  dpBack("breaches", risk === "unlikely" ? "Recorded." : "Recorded. Report it to the ICO within 72 hours of finding it (ico.org.uk/report).", err);
}
export async function breachStepAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  const s = str(f, "step", 8); if (s === "ico" || s === "told" || s === "closed") await P.breachStep(me.id, str(f, "id", 40), s);
  dpBack("breaches", "Updated.");
}
export async function addProcessorAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  if (f.get("usual")) await P.addProcessor(me.id, "usual");
  else { const name = str(f, "name", 80); if (!name) dpBack("processors", null, "Give the supplier a name.");
    await P.addProcessor(me.id, { name, purpose: str(f, "purpose", 200), data: str(f, "data", 200), location: str(f, "location", 80), safeguard: str(f, "safeguard", 120) || null, dpa: /^\d{4}-\d\d-\d\d$/.test(str(f, "dpa", 10)) ? str(f, "dpa", 10) : null }); }
  dpBack("processors", "Supplier added.");
}
export async function setDpaAction(f: FormData): Promise<void> {
  const me = await requireStaff(); const P = await import("@/lib/privacy");
  const d = str(f, "on", 10); await P.setDpa(me.id, str(f, "id", 40), /^\d{4}-\d\d-\d\d$/.test(d) ? d : null);
  dpBack("processors", "Saved.");
}

// ---------- automations ----------
export async function saveAutomationAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const A = await import("@/lib/automations");
  const key = str(f, "key", 40), m = str(f, "minutes", 6);
  const d = { enabled: f.get("enabled") === "on", subject: str(f, "subject", 200), body: String(f.get("body") ?? "").slice(0, 5000), minutes: m === "" ? null : Number(m), to_parent: f.get("to_parent") === "on", to_student: f.get("to_student") === "on" };
  if (f.get("test")) {
    const r = await A.testAutomation(key, { name: me.name, email: me.email }, d);
    redirect(`/admin/automations?open=${key}&${r.ok ? "ok=" + encodeURIComponent(`Test sent to ${me.email}.`) : "err=" + encodeURIComponent(r.error ?? "Couldn’t send the test.")}#${key}`);
  }
  const err = await A.saveAutomation(me.id, key, d);
  if (!err && d.enabled) await A.runAutomations(60).catch(() => null);
  redirect(`/admin/automations?${err ? `open=${key}&err=` + encodeURIComponent(err) : "ok=" + encodeURIComponent(d.enabled ? "Saved and switched on." : "Saved. It’s switched off.")}#${key}`);
}
export async function runAutomationsAction(): Promise<void> {
  await requireStaff();
  const A = await import("@/lib/automations");
  const r = await A.runAutomations(300);
  redirect(`/admin/automations?ok=${encodeURIComponent(r.sent ? `${r.sent} email${r.sent === 1 ? "" : "s"} sent or booked.` : "Nothing due right now.")}`);
}

export async function viewAsFamilyAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const kind = str(f, "kind", 1) === "s" ? "s" : "p", id = str(f, "id", 40);
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/admin/view-as?kind=" + kind);
  const { viewAsFamily } = await import("@/lib/family-auth");
  await viewAsFamily(me.id, kind, id);
  await withSchool((q) => q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'view_as', $2, $3)`, [me.id, kind === "p" ? "parent" : "student", id]));
  redirect(kind === "p" ? "/parent" : "/student");
}
export async function assignMeetCodeAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { assignCode } = await import("@/lib/meet");
  const err = await assignCode(me.id, str(f, "code", 12), str(f, "group", 40));
  attBack("google", "Linked. Press Re-read with the first day of term to place this class’s joins.", err);
}
export async function timesFromMeetAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { timesFromMeet } = await import("@/lib/meet");
  const codes = f.getAll("code").map(String).filter((c) => /^[a-z]{10}$/.test(c));
  const r = await timesFromMeet(me.id, codes);
  const ok = r.done.length ? `Timetable set from Google Meet: ${r.done.join(" · ")}. Now press Re-read.` : null;
  attBack("google", ok, r.problems.length ? r.problems.join(" · ") : ok ? null : "Nothing to change.");
}
export async function matchPersonAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { matchPerson } = await import("@/lib/meet");
  const ignore = !!f.get("ignore");
  const err = await matchPerson(me.id, str(f, "key", 300), ignore ? null : str(f, "student", 40) || null);
  attBack("joins", ignore ? "Marked as not a student." : "Matched. Every lesson they joined is updated, and their email is remembered.", err);
}
export async function notALessonAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { notALesson } = await import("@/lib/meet");
  await notALesson(me.id, str(f, "code", 12));
  attBack("google", "Hidden. Calls on that Meet code are ignored from now on.");
}
// ---------- Google Classroom and the school inbox ----------
export async function syncClassroomAction(): Promise<void> {
  const me = await requireStaff();
  const { syncClassroom } = await import("@/lib/classroom");
  const r = await syncClassroom(me.name);
  attBack("google", r.error ? null : `Classroom read: ${r.classes ?? 0} class${r.classes === 1 ? "" : "es"}, ${r.work ?? 0} pieces of work, ${r.submissions ?? 0} hand-ins${r.joined ? `, ${r.joined} invitation${r.joined === 1 ? "" : "s"} now accepted` : ""}.${r.problems?.length ? ` ${r.problems.length} class${r.problems.length === 1 ? "" : "es"} couldn’t be read (see below).` : ""}`, r.error ?? null);
}
const mailBack = (ok?: string | null, err?: string | null, show?: string) => redirect(`/admin/email?tab=inbox${show === "all" ? "&show=all" : ""}` + (err ? `&err=${encodeURIComponent(err)}` : ok ? `&ok=${encodeURIComponent(ok)}` : ""));
export async function syncInboxAction(): Promise<void> {
  await requireStaff();
  const { syncInbox } = await import("@/lib/inbox");
  const r = await syncInbox();
  mailBack(r.error ? null : `Inbox read: ${r.added ?? 0} new email${r.added === 1 ? "" : "s"} from families.`, r.error ?? null);
}
export async function markInboxAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { markInbox } = await import("@/lib/inbox");
  const all = f.get("all") === "1", id = str(f, "id", 40);
  await markInbox(me.id, all ? "all" : [id], f.get("read") !== "0");
  mailBack(null, null, str(f, "show", 5));
}
export async function disconnectInboxAction(f?: FormData): Promise<void> {
  const me = await requireStaff();
  if (me.role !== "school_admin") mailBack(null, "Only a school admin can disconnect the inbox.");
  const { disconnectInbox } = await import("@/lib/inbox");
  const box = f ? String(f.get("mailbox") ?? "").slice(0, 200) : "";
  await disconnectInbox(box || undefined);
  mailBack(`${box || "The school inbox"} is disconnected. Emails already shown here stay until they’re a year old.`);
}
export async function replyFromAction(f: FormData): Promise<void> {
  await requireStaff();
  const { setReplyFrom } = await import("@/lib/inbox");
  await setReplyFrom(String(f.get("from") ?? "").trim().slice(0, 200));
  mailBack("Saved. Reply buttons now open Gmail as that address.");
}
// ---------- Post designs: Canva connection and the picture library ----------
const dsBack = (ok?: string | null, err?: string | null) => redirect(`/admin/social?view=pictures` + (err ? `&err=${encodeURIComponent(err)}` : ok ? `&ok=${encodeURIComponent(ok)}` : ""));
async function dsAdmin() { const me = await requireStaff(); if (me.role !== "school_admin") dsBack(null, "Only a school admin can change this."); return me; }
export async function canvaAppAction(f: FormData): Promise<void> {
  await dsAdmin(); const D = await import("@/lib/designs");
  let err: string | null = null;
  try { await D.canvaSaveApp(str(f, "client_id", 100), str(f, "client_secret", 300)); } catch (e) { err = e instanceof D.DesignError ? e.message : "Couldn’t save that."; }
  dsBack(err ? null : "Saved. Now press Connect Canva.", err);
}
export async function canvaFolderAction(f: FormData): Promise<void> {
  await dsAdmin(); const D = await import("@/lib/designs");
  let err: string | null = null;
  try { await D.canvaFolder(str(f, "folder", 300)); } catch (e) { err = e instanceof D.DesignError ? e.message : "Couldn’t save that."; }
  dsBack(err ? null : "Folder saved. “From Canva” now opens that folder.", err);
}
export async function canvaDisconnectAction(f: FormData): Promise<void> {
  await dsAdmin(); const D = await import("@/lib/designs");
  await D.canvaDisconnect(f.get("forget") === "1"); dsBack("Canva is disconnected. Pictures already brought in stay in the library.");
}
export async function deleteDesignAssetAction(f: FormData): Promise<void> {
  await dsAdmin(); const D = await import("@/lib/designs");
  await D.deleteAsset(str(f, "id", 40)); dsBack("Picture removed from the library.");
}
// ---------- Recordings (the Meet recordings tracker) ----------
const recBack = (tab: string, ok?: string | null, err?: string | null, extra = "") => redirect(`/admin/recordings?tab=${tab}${extra}` + (err ? `&err=${encodeURIComponent(err)}` : ok ? `&ok=${encodeURIComponent(ok)}` : ""));
async function recAdmin(tab: string) { const me = await requireStaff(); if (me.role !== "school_admin") recBack(tab, null, "Only a school admin can do that."); return me; }
export async function runRecordingsAction(): Promise<void> {
  const me = await recAdmin("week"); const R = await import("@/lib/recordings");
  const r = await R.runRecordings(me.name);
  const { recCfg } = R; const live = (await recCfg()).mode === "live";
  if (!live) recBack("week", r.error ? null : `Read Drive and Classroom: ${r.filed} new recording${r.filed === 1 ? "" : "s"} found. Watch only: nothing was changed.`, r.error ?? null);
  recBack("week", r.error ? null : `Done: ${r.filed} recording${r.filed === 1 ? "" : "s"} filed, ${r.flagged} flagged as too short, ${r.posted} posted to Classroom, ${r.cards} title card${r.cards === 1 ? "" : "s"} started.${r.problems?.length ? ` ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}: see Needs a look.` : ""}`, r.error ?? null);
}
export async function recCfgAction(f: FormData): Promise<void> {
  await recAdmin("settings"); const R = await import("@/lib/recordings");
  const id = (k: string) => { const v = str(f, k, 300).replace(/^.*\/folders\//, "").replace(/[?#].*$/, ""); return /^[\w-]{10,80}$/.test(v) ? v : undefined; };
  const url = str(f, "cardUrl", 300), secret = str(f, "cardSecret", 300);
  if (url && !/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(url)) recBack("settings", null, "The title-card service URL should start with https://.");
  await R.saveRecCfg({ meetFolder: id("meetFolder"), transcriptsFolder: id("transcriptsFolder"), flaggedFolder: id("flaggedFolder"), oneToOneFolder: id("oneToOneFolder"),
    ...(url ? { cardUrl: url } : {}), ...(secret ? { cardSecret: secret } : {}), autoCards: f.get("autoCards") === "1",
    mode: f.get("mode") === "live" ? "live" : "watch",
    minBytes: Math.max(256 * 1024, Math.round(Number(str(f, "minMb", 6) || 5) * 1024 * 1024)) });
  recBack("settings", "Settings saved.");
}
export async function recLessonAction(f: FormData): Promise<void> {
  await recAdmin("settings"); const R = await import("@/lib/recordings");
  const err = await R.saveLesson({ id: str(f, "id", 40) || undefined, kind: str(f, "kind", 6), meet_code: str(f, "meet_code", 80), name: str(f, "name", 120), course_id: str(f, "course_id", 30),
    folder_id: str(f, "folder_id", 300), per_week: str(f, "per_week", 2), year_suffix: str(f, "year_suffix", 3), active: f.get("active") !== "0" });
  recBack("settings", err ? null : "Saved.", err);
}
export async function editCardAction(f: FormData): Promise<void> {
  await recAdmin("cards"); const R = await import("@/lib/recordings");
  await R.editCard(str(f, "id", 40), str(f, "title", 160), str(f, "teacher", 80));
  recBack("cards", "Updated. Check the new preview.");
}
export async function approveCardsAction(f: FormData): Promise<void> {
  await recAdmin("cards"); const R = await import("@/lib/recordings");
  await R.approveCards(f.getAll("id").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)));
  recBack("cards", "Approved. The cards are added on the next run (or press Run now).");
}
export async function postAnywayAction(f: FormData): Promise<void> {
  await recAdmin("look"); const R = await import("@/lib/recordings");
  const res = await R.postNow(str(f, "id", 40)); recBack("look", res.ok ? res.note : null, res.ok ? undefined : res.note);
}
export async function disconnectRecAction(): Promise<void> {
  await recAdmin("settings"); const R = await import("@/lib/recordings");
  await R.disconnectRec(); recBack("settings", "The recordings account is disconnected.");
}
export async function importRecordingsAction(): Promise<void> {
  await recAdmin("settings"); const R = await import("@/lib/recordings");
  const r = await R.importNow();
  recBack("week", r.error ? null : `Read the subject folders: ${r.added} earlier recording${r.added === 1 ? "" : "s"} added.`, r.error ?? null);
}

// ---------- Demo school ----------
export async function resetDemoAction(): Promise<void> {
  const me = await requireStaff();
  const { resetDemo } = await import("@/lib/demo");
  const err = await resetDemo(me);
  redirect("/admin?" + (err ? `err=${encodeURIComponent(err)}` : `ok=${encodeURIComponent("The demo school has been made again with fresh example data. Pick “Demo Academy” in the School switcher.")}`));
}

// ---------- OH-SO EdTech trial requests ----------
export async function edtechTrialAction(f: FormData): Promise<void> {
  const me = await requireStaff(); if (me.role !== "school_admin") redirect("/admin/edtech");
  const { updateTrial } = await import("@/lib/edtech");
  await updateTrial(String(f.get("id") ?? "").slice(0, 40), String(f.get("status") ?? ""), String(f.get("note") ?? ""));
  redirect("/admin/edtech?ok=" + encodeURIComponent("Saved."));
}
// ---------- customisable dashboard ----------
const DASH_MODULES: Record<string, string[]> = { "admin-home": ["hero", "k-students", "k-places", "k-attendance", "k-collected", "k-next", "k-failed", "today", "attention", "collections", "bookings", "coming", "fullest", "tasters", "quick"] };
export async function saveDashLayoutAction(page: string, layout: { id: string; size: string }[] | null): Promise<void> {
  const me = await requireStaff();
  const known = DASH_MODULES[page]; if (!known) return;
  const { saveLayout } = await import("@/lib/dashboard-layout");
  await saveLayout(me.id, page, layout as never, known);
  revalidatePath("/admin");
}
// ---------- dashboard menus (Admin → Menus) ----------
export async function saveMenuAction(area: string, cfg: { groups: { title: string; items: string[] }[]; hidden: string[] } | null): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const { MENU_AREAS } = await import("@/lib/menus");
  if (!MENU_AREAS.some((a) => a.id === area)) return { ok: false, error: "Unknown menu." };
  if (cfg && (!Array.isArray(cfg.groups) || !cfg.groups.length)) return { ok: false, error: "Keep at least one group." };
  const { saveMenuConfig } = await import("@/lib/menu-config");
  await saveMenuConfig(area as never, cfg as never);
  revalidatePath("/", "layout");
  return { ok: true };
}
// ---------- live lessons: video tool and check-ins (School settings) ----------
export async function saveVideoAction(f: FormData): Promise<void> {
  await requireStaff();
  const { VIDEO_TOOLS } = await import("@/lib/video");
  const tool = String(f.get("tool") ?? "");
  if (!VIDEO_TOOLS.some((t) => t.id === tool)) redirect("/admin/school?err=" + encodeURIComponent("Choose a video tool."));
  const { saveVideoSettings } = await import("@/lib/checkins");
  await saveVideoSettings({ tool: tool as never, checkins: f.get("checkins") === "on" });
  redirect("/admin/school?ok=" + encodeURIComponent("Live lesson settings saved.") + "#live");
}
// ---------- Zoom (School settings → Live lessons) ----------
const zoomBack = (key: "ok" | "err", msg: string): never => redirect(`/admin/school?${key}=${encodeURIComponent(msg)}#zoom`);
export async function saveZoomAppAction(f: FormData): Promise<void> {
  await requireStaff();
  const { saveZoomApp, ZoomError } = await import("@/lib/zoom");
  try { await saveZoomApp(String(f.get("client_id") ?? ""), String(f.get("client_secret") ?? "")); }
  catch (e) { zoomBack("err", e instanceof ZoomError ? e.message : "Couldn’t save."); }
  zoomBack("ok", "Saved. Now press Connect Zoom.");
}
export async function zoomOptionsAction(f: FormData): Promise<void> {
  await requireStaff();
  const z = await import("@/lib/zoom");
  const what = String(f.get("what") ?? "");
  if (what === "disconnect") { await z.disconnectZoom(); zoomBack("ok", "Zoom is disconnected. Marks already taken stay."); }
  if (what === "recordings") { await z.setZoomRecordings(f.get("on") === "on"); zoomBack("ok", f.get("on") === "on" ? "New Zoom cloud recordings will be posted to each class’s Google Classroom." : "Zoom recordings won’t be posted."); }
  if (what === "sync") {
    const me = await requireStaff(); const r = await z.syncZoom(me.name, 14);
    zoomBack(r.error ? "err" : "ok", r.error ?? `Zoom synced: ${r.joins} new join${r.joins === 1 ? "" : "s"} in ${r.lessons} lesson${r.lessons === 1 ? "" : "s"}${r.posted ? `, ${r.posted} recordings posted` : ""}.`);
  }
}
// ---------- chat safety rules and alerts (Student chat) ----------
export async function saveChatSafetyAction(f: FormData): Promise<void> {
  await requireStaff();
  const { RULES, saveSafetyCfg } = await import("@/lib/chat-safety");
  const modes = Object.fromEntries(RULES.map((r) => { const m = String(f.get(`mode_${r.id}`) ?? "alert"); return [r.id, m === "off" || (m === "block" && r.canBlock) ? m : "alert"]; }));
  const email = String(f.get("email") ?? "").split(/[\s,;]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 5).join(", ");
  const rules = String(f.get("rules") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 200));
  if (!rules.length) redirect("/admin/student-chat?err=" + encodeURIComponent("Keep at least one chat rule for families.") + "#safety");
  await saveSafetyCfg({ modes: modes as never, email, rules });
  redirect("/admin/student-chat?ok=" + encodeURIComponent("Chat safety rules saved.") + "#safety");
}
export async function resolveChatFlagAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const { resolveFlag } = await import("@/lib/chat-safety");
  await resolveFlag(me.id, String(f.get("id") ?? "").slice(0, 40), f.get("hide") === "1");
  revalidatePath("/admin");
  redirect("/admin/student-chat?ok=" + encodeURIComponent(f.get("hide") === "1" ? "Message hidden and alert closed." : "Alert closed."));
}
// ---------- Inbox: read the whole email and reply from the admin ----------
export async function inboxMessageAction(id: string) {
  await requireStaff();
  const { inboxMessage } = await import("@/lib/inbox");
  return inboxMessage(String(id).slice(0, 40));
}
export async function replyInboxAction(id: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  const { replyInbox } = await import("@/lib/inbox");
  const err = await replyInbox({ id: me.id, name: me.name }, String(id).slice(0, 40), String(text).slice(0, 20000));
  if (!err) revalidatePath("/admin/email");
  return err ? { ok: false, error: err } : { ok: true };
}
// ---------- Email design (logo, colour, footer of every email) ----------
export async function saveEmailDesignAction(f: FormData): Promise<void> {
  await requireStaff();
  const { saveEmailDesign } = await import("@/lib/email");
  await saveEmailDesign({ logo: f.get("logo") === "on", color: String(f.get("color") ?? ""), footer: String(f.get("footer") ?? "").replace(/\r\n/g, "\n") });
  redirect("/admin/email?tab=design&ok=" + encodeURIComponent("Email design saved. Every email from now on uses it."));
}
// ---------- Register: read the latest Google Meet joins now ----------
export async function refreshJoinsAction(f: FormData): Promise<void> {
  const me = await requireSignedIn();
  const id = String(f.get("id") ?? "").slice(0, 40);
  const { syncMeet } = await import("@/lib/meet");
  const r = await syncMeet(me.name).catch(() => null);
  redirect(`/admin/register/${id}?` + (r && !("error" in r && r.error) ? "ok=" + encodeURIComponent("Checked Google Meet for new joins.") : "err=" + encodeURIComponent((r as { error?: string } | null)?.error ?? "Couldn’t reach Google Meet.")));
}
