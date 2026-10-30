"use server";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { MARKING_SUBJECTS } from "./subjects";

const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

/** A past paper marking request: saved as an enquiry (kind "marking") with the paper attached, for the office to mark and invoice. */
export async function sendPaper(form: FormData) {
  const v = (k: string, n = 200) => String(form.get(k) ?? "").trim().slice(0, n);
  const back = (m: string) => redirect(`/other-services/past-paper-marking?error=${encodeURIComponent(m)}`);
  if (v("website")) redirect("/other-services/past-paper-marking?sent=1");   // bots fill the hidden box
  const first = v("first", 80), last = v("last", 80), email = v("email"), child = v("child", 120), subject = v("subject", 80), message = v("message", 3000);
  if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back("Add your name and a valid email address.");
  if (!MARKING_SUBJECTS.includes(subject)) return back("Choose the subject of the paper.");
  const file = form.get("paper");
  if (!(file instanceof File) || file.size === 0) return back("Attach the paper you’d like marked.");
  if (!TYPES.includes(file.type)) return back("The paper must be a PDF, Word document or photo (JPG, PNG).");
  if (file.size > 3.5 * 1024 * 1024) return back("The file must be under 3.5 MB. For a bigger file, send it to us by email.");
  const data = Buffer.from(await file.arrayBuffer());
  await withSchool((q) => q(`insert into enquiries (school_id, kind, name, email, child_name, subject, message, file, file_name, file_type)
    values (current_school(), 'marking', $1, $2, $3, $4, $5, $6, $7, $8)`, [`${first} ${last}`, email, child || null, subject, message || null, data, file.name.slice(0, 160), file.type]));
  redirect("/other-services/past-paper-marking?sent=1");
}
