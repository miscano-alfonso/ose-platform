"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { requireStaff, signIn, signOut, setUpFirstAdmin, changePassword } from "@/lib/auth";

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
  const me = await requireStaff();
  const next = String(f.get("next") ?? "").slice(0, 200);
  if (next !== String(f.get("confirm") ?? "").slice(0, 200)) return { error: "The two new passwords don’t match." };
  const err = await changePassword(me.id, String(f.get("current") ?? "").slice(0, 200), next);
  return err ? { error: err } : { ok: true };
}

// ---------- classes ----------
const MODES = ["auto", "keep_open", "full"], LABELS = ["auto", "off", "few_spaces", "almost_full", "new_group", "launching_soon"],
  STATUSES = ["open", "waitlist", "priority", "closed", "hidden"];

export async function updateGroupAction(f: FormData) {
  const me = await requireStaff();
  const id = str(f, "id", 40), capRaw = str(f, "capacity", 4);
  const capacity = capRaw === "" ? null : Math.max(1, Math.min(200, parseInt(capRaw, 10) || 0));
  const mode = str(f, "capacity_mode"), label = str(f, "sticky_label"), status = str(f, "status");
  if (!MODES.includes(mode) || !LABELS.includes(label) || !STATUSES.includes(status)) return;
  await withSchool(async (q) => {
    const before = await q(`select capacity, capacity_mode, sticky_label, status from course_groups where id = $1`, [id]);
    if (!before[0]) return;
    await q(`update course_groups set capacity = $2, capacity_mode = $3::capacity_mode, sticky_label = $4::sticky_label, status = $5::group_status where id = $1`,
      [id, capacity, mode, label, status]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'course_group', $2, $3)`,
      [me.id, id, JSON.stringify({ before: before[0], after: { capacity, capacity_mode: mode, sticky_label: label, status } })]);
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
