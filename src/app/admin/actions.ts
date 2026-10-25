"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { headers } from "next/headers";
import { parseImport, runImport, type ImportReport } from "@/lib/import";
import { buildSchedules, setFamilyTerm } from "@/lib/payments";
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
  revalidatePath("/admin/enquiries"); revalidatePath("/admin");
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
