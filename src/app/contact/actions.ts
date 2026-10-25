"use server";
import { redirect } from "next/navigation";
import { saveEnquiry } from "@/lib/data";

const LEVELS = ["KS3", "Pre-GCSE", "iGCSE", "A-Level"];
const HEARD = ["Word of Mouth", "Google Search", "Facebook Group"];

export async function sendMessage(form: FormData) {
  const v = (k: string) => String(form.get(k) ?? "").trim();
  // bots fill the hidden "website" box; say thanks and drop it
  if (v("website")) redirect("/contact?sent=1");
  const name = v("name").slice(0, 120), email = v("email").slice(0, 200), message = v("message").slice(0, 4000);
  const levels = form.getAll("levels").map(String).filter((l) => LEVELS.includes(l));
  const heard = HEARD.includes(v("heard")) ? v("heard") : null;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/contact?error=1");
  await saveEnquiry({ name, email, levels, heard, message: message || null });
  redirect("/contact?sent=1");
}
