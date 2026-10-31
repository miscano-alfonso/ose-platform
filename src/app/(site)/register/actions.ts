"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentFamily, sendVerifyLink } from "@/lib/family-auth";
import { siteBase } from "@/lib/social";
import { NEEDS } from "@/lib/send";
import { registerFamily, addChildren, checkChild, checkChildEmails, GENDERS, type ChildIn } from "@/lib/registration";

const safeNext = (n: string) => (/^\/(cart|parent)(\/|$|\?)/.test(n) ? n : "/cart");

function readChildren(f: FormData): Promise<ChildIn[]> {
  const n = Math.min(8, Math.max(1, parseInt(String(f.get("count") ?? "1"), 10) || 1));
  const v = (k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);
  return Promise.all(Array.from({ length: n }, async (_, i) => ({
    first: v(`c${i}_first`, 60), last: v(`c${i}_last`, 60), email: v(`c${i}_email`, 160).toLowerCase(),
    dob: v(`c${i}_dob`, 10) || null, known: v(`c${i}_known`, 60) || null,
    gender: GENDERS.includes(v(`c${i}_gender`, 30)) ? v(`c${i}_gender`, 30) : null,
    send: v(`c${i}_send`, 3) === "yes" ? true : v(`c${i}_send`, 3) === "no" ? false : null,
    sendDetails: v(`c${i}_send_details`, 2000) || null, adjustments: v(`c${i}_adjust`, 2000) || null, share: f.get(`c${i}_share`) !== "off",
    needs: f.getAll(`c${i}_needs`).map(String).filter((x) => NEEDS.includes(x)),
    files: await Promise.all(f.getAll(`c${i}_files`).filter((x): x is File => x instanceof File && x.size > 0).slice(0, 5)
      .map(async (x) => ({ name: x.name, mime: x.type, data: Buffer.from(await x.arrayBuffer()) }))),
  })));
}

/** New parents register with their children and are signed in straight away; signed-in parents can add children here too. */
export async function registerAction(f: FormData): Promise<void> {
  const v = (k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
  const next = safeNext(v("next", 100));
  const back = (m: string) => redirect(`/register?next=${encodeURIComponent(next)}&error=${encodeURIComponent(m)}`);
  if (v("website")) redirect(next);
  const kids = (await readChildren(f)).filter((c, i) => i === 0 || c.first || c.last || c.email);
  for (const [i, c] of kids.entries()) { const e = checkChild(c, i + 1); if (e) return back(e); }
  const fam = await currentFamily();
  if (fam?.kind === "parent") {
    if (fam.viewer) return back("You’re viewing as this family, so nothing can be changed.");
    const dup = await checkChildEmails(fam.email, kids); if (dup) return back(dup);
    await addChildren(fam.id, kids);
    redirect(`${next}${next.includes("?") ? "&" : "?"}added=${kids.length}`);
  }
  const p = { first: v("first", 60), last: v("last", 60), email: v("email").toLowerCase(), phone: v("phone", 30) || null, heard: v("heard", 60) || null, marketing: f.get("marketing") === "on" };
  if (!p.first || !p.last) return back("Add your first and last name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return back("Add a valid email address.");
  if (f.get("terms") !== "on") return back("Please agree to the Terms & Conditions.");
  const dup = await checkChildEmails(p.email, kids); if (dup) return back(dup);
  const id = await registerFamily(p, kids);
  if (id === "exists") redirect(`/account?next=cart&err=${encodeURIComponent("That email already has an account. We can email you a sign-in link instead.")}`);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const sent = await sendVerifyLink(id, await siteBase(origin));
  redirect(`/register?check=${encodeURIComponent(p.email)}${sent.ok ? "" : "&error=" + encodeURIComponent("We couldn’t send the email just now. Use “I already have an account” to get a new link.")}`);
}
