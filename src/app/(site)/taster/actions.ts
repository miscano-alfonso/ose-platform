"use server";
import { redirect } from "next/navigation";
import { bookTastersFromWebsite } from "@/lib/tasters-public";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function bookTasterAction(form: FormData) {
  const v = (k: string) => String(form.get(k) ?? "").trim();
  if (v("website")) redirect("/taster?booked=1");   // bots fill the hidden box
  const lessons = [...form.entries()].filter(([k, x]) => k.startsWith("lesson_") && UUID.test(String(x))).map(([, x]) => String(x));
  // 1 Nov: tasters are booked by a signed-in parent, for one of their registered children
  const { currentFamily } = await import("@/lib/family-auth");
  const { parentKids } = await import("@/lib/tasters-public");
  const fam = await currentFamily();
  if (fam?.kind !== "parent" || fam.viewer) redirect("/account?next=taster");
  const fail = (m: string) => redirect(`/taster?error=${encodeURIComponent(m)}`);
  const kid = (await parentKids(fam.id)).find((k) => k.id === v("child"));
  if (!kid) fail("Choose which of your children the taster is for.");
  if (!kid!.email || !EMAIL.test(kid!.email)) fail(`Add ${kid!.first}’s Google account email first (in your account, My details): the Classroom invitation goes there.`);
  if (kid!.email!.toLowerCase() === fam.email.toLowerCase()) fail(`${kid!.first} needs their own Google account for Classroom, not the parent’s email.`);
  if (form.get("agree") !== "on") fail("Please tick the box to confirm you’ve read how Classroom access works.");
  const f = { parentFirst: fam.first, parentLast: fam.last, parentEmail: fam.email.toLowerCase(), childName: kid!.name, childEmail: kid!.email!.toLowerCase(),
    message: v("message").slice(0, 2000) || null, lessons, parentId: fam.id, studentId: kid!.id };
  const err = await bookTastersFromWebsite(f);
  if (err) fail(err);
  redirect("/taster?booked=1");
}
