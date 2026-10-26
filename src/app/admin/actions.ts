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
import { addSlot, removeSlot, setClassTeacher, makeLessonDates, saveRegister, cancelLesson, bookTaster, setTasterStatus } from "@/lib/ops";
import { requireStaff, requireSignedIn, signIn, signOut, setUpFirstAdmin, changePassword, createInvite, acceptInvite, VIEWAS_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";
import { SCHOOL_COOKIE, siteSchool, listSchools } from "@/lib/db";

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
  await withSchool(async (q) => {
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
  if (!(day >= 1 && day <= 7) || !/^\d{2}:\d{2}$/.test(start) || mins < 15 || mins > 180) return back("/admin/timetable", "Pick a day, a start time and a length.", "");
  const err = await addSlot(me.id, str(f, "group", 40), day, start, mins, str(f, "teacher", 40) || null);
  revalidatePath("/admin/timetable"); revalidatePath("/timetable"); revalidatePath("/courses");
  back("/admin/timetable", err, "Lesson time added.");
}
export async function removeSlotAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const note = await removeSlot(me.id, str(f, "id", 40));
  revalidatePath("/admin/timetable"); revalidatePath("/timetable"); revalidatePath("/courses");
  back("/admin/timetable", note, "Lesson time removed.");
}
export async function setClassTeacherAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const mins = Math.max(15, Math.min(180, parseInt(str(f, "minutes", 3), 10) || 45));
  const err = await setClassTeacher(me.id, str(f, "group", 40), str(f, "teacher", 40) || null, mins);
  revalidatePath("/admin/timetable"); revalidatePath("/teachers"); revalidatePath("/courses");
  back("/admin/timetable", err, "Class updated.");
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
  revalidatePath("/admin/payroll"); payBack(err, "Pay run updated from the registers.");
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
    working: n(`working_${id}`, 9), predicted: n(`predicted_${id}`, 9), comment: str(f, `comment_${id}`, 2000) }));
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
  revalidatePath("/", "layout");
  termBack(year, r.error ? "err" : "ok", r.error ?? `Term dates saved and this year’s prices updated${r.moved ? ` (${r.moved} classes moved plan)` : ""}.`);
}
export async function addHolidayAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  const year = str(f, "year", 40) || null, s1 = str(f, "starts", 10), e1 = str(f, "ends", 10);
  if (!ISO.test(s1) || !ISO.test(e1) || e1 < s1) return termBack(year, "err", "Check the holiday dates.");
  await addHoliday(me.id, str(f, "name", 80), s1, e1); revalidatePath("/admin/term-dates"); termBack(year, "ok", "Holiday added.");
}
export async function removeHolidayAction(f: FormData): Promise<void> {
  const me = await requireStaff();
  await removeHoliday(me.id, str(f, "id", 40)); revalidatePath("/admin/term-dates"); termBack(str(f, "year", 40) || null, "ok", "Holiday removed.");
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
  await requireSignedIn();
  const slug = str(f, "school", 40);
  if (!(await listSchools()).some((x) => x.slug === slug)) redirect("/admin");
  const jar = await cookies();
  jar.delete({ name: VIEWAS_COOKIE, path: "/admin" });
  if (slug === siteSchool()) jar.delete({ name: SCHOOL_COOKIE, path: "/admin" });
  else jar.set(SCHOOL_COOKIE, slug, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: 30 * 86400 });
  redirect("/admin"); // each school has its own staff accounts: sign in there if you aren't already
}
export async function setViewAsAction(f: FormData): Promise<void> {
  await requireStaff();
  const v = str(f, "as", 60), jar = await cookies();
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
