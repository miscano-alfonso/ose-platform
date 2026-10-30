"use server";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { getWorkshops } from "@/lib/data";

/** A workshop booking request from the website: saved as an enquiry (kind "workshop") for the office to confirm by email.
 *  (Paid workshops are invoiced by the office; nothing is charged here.) */
export async function requestWorkshop(form: FormData) {
  const v = (k: string, n = 200) => String(form.get(k) ?? "").trim().slice(0, n);
  const slug = v("slug", 120);
  const page = `/other-services/workshop/${encodeURIComponent(slug)}`;
  const back = (m: string) => redirect(`${page}?error=${encodeURIComponent(m)}#book`);
  if (v("website")) redirect(`${page}?sent=1#book`);   // bots fill the hidden box
  const w = (await getWorkshops()).find((x) => x.slug === slug);
  if (!w) redirect("/other-services");
  if (w.places_left === 0) return back("Sorry, this workshop is now full.");
  const first = v("first", 80), last = v("last", 80), email = v("email"), child = v("child", 120), year = v("year", 40), ours = v("ours", 10), message = v("message", 2000);
  if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back("Add your name and a valid email address.");
  if (!child) return back("Add your child’s name.");
  await withSchool((q) => q(`insert into enquiries (school_id, kind, name, email, child_name, subject, levels, heard_about, message)
    values (current_school(), 'workshop', $1, $2, $3, $4, $5, $6, $7)`,
    [`${first} ${last}`, email, child, w.title, year ? [year] : [], ours === "yes" ? "already an OH-SO ED family" : null, message || null]));
  redirect(`${page}?sent=1#book`);
}
