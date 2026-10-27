"use server";
import { redirect } from "next/navigation";
import { bookTastersFromWebsite } from "@/lib/tasters-public";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function bookTasterAction(form: FormData) {
  const v = (k: string) => String(form.get(k) ?? "").trim();
  if (v("website")) redirect("/taster?booked=1");   // bots fill the hidden box
  const lessons = [...form.entries()].filter(([k, x]) => k.startsWith("lesson_") && UUID.test(String(x))).map(([, x]) => String(x));
  const f = { parentFirst: v("parent_first").slice(0, 60), parentLast: v("parent_last").slice(0, 60), parentEmail: v("parent_email").toLowerCase().slice(0, 200),
    childName: v("child_name").slice(0, 60), childEmail: v("child_email").toLowerCase().slice(0, 200), message: v("message").slice(0, 2000) || null, lessons };
  const fail = (m: string) => redirect(`/taster?error=${encodeURIComponent(m)}`);
  if (!f.parentFirst || !f.parentLast || !f.childName) fail("Please fill in your name and your child’s first name.");
  if (!EMAIL.test(f.parentEmail)) fail("Please check your email address.");
  if (!EMAIL.test(f.childEmail)) fail("Please give your child’s Google account email (for example a Gmail address).");
  if (f.childEmail === f.parentEmail) fail("Your child needs their own Google account for Classroom, not the parent’s email.");
  if (form.get("agree") !== "on") fail("Please tick the box to confirm you’ve read how Classroom access works.");
  const err = await bookTastersFromWebsite(f);
  if (err) fail(err);
  redirect("/taster?booked=1");
}
