"use server";
import { redirect } from "next/navigation";
import { openTrialSchool, signInCustomer, requestReset, resetPassword } from "@/lib/edtech-account";

const s = (f: FormData, k: string, n = 200) => String(f.get(k) ?? "").slice(0, n);

/** /osedtech/start: choose a password, the school is made, then straight into its dashboard. */
export async function openSchoolAction(f: FormData) {
  const t = s(f, "t", 80), pw = s(f, "password"), again = s(f, "confirm");
  if (pw !== again) redirect(`/osedtech/start?t=${encodeURIComponent(t)}&error=${encodeURIComponent("The two passwords don’t match.")}`);
  const err = await openTrialSchool(t, pw);
  if (err) redirect(`/osedtech/start?t=${encodeURIComponent(t)}&error=${encodeURIComponent(err)}`);
  redirect("/admin?welcome=1");
}
export async function customerSignInAction(f: FormData) {
  const email = s(f, "email");
  const err = await signInCustomer(email, s(f, "password"));
  if (err) redirect(`/osedtech/login?error=${encodeURIComponent(err)}&email=${encodeURIComponent(email.trim().toLowerCase())}`);
  redirect("/admin");
}
export async function forgotAction(f: FormData) {
  await requestReset(s(f, "email"));
  redirect("/osedtech/login/forgot?sent=1");
}
export async function resetAction(f: FormData) {
  const t = s(f, "t", 80), pw = s(f, "password");
  if (pw !== s(f, "confirm")) redirect(`/osedtech/login/reset?t=${encodeURIComponent(t)}&error=${encodeURIComponent("The two passwords don’t match.")}`);
  const err = await resetPassword(t, pw);
  if (err) redirect(`/osedtech/login/reset?t=${encodeURIComponent(t)}&error=${encodeURIComponent(err)}`);
  redirect("/admin");
}
