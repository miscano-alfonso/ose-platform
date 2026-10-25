"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { headers } from "next/headers";
import { parseImport, runImport, type ImportReport } from "@/lib/import";
import { buildSchedules, setFamilyTerm } from "@/lib/payments";
import { setLevelRate, buildPayRun, setAdjustment, setRunStatus } from "@/lib/payroll";
import { setTutorRate, addAvailability, removeAvailability, bookTutoring, setTutoringStatus } from "@/lib/tutoring";
import { createCycle, createEntries, reviewEntry, approveAllSubmitted, publishCycle, saveWriteSheet, type WriteInput } from "@/lib/reports";
import { addSlot, removeSlot, setClassTeacher, makeLessonDates, saveRegister, cancelLesson, bookTaster, setTasterStatus } from "@/lib/ops";
import { requireStaff, requireSignedIn, signIn, signOut, setUpFirstAdmin, changePassword, createInvite, acceptInvite } from "@/lib/auth";

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
