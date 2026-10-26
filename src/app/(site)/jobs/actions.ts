"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getJobBySlug, saveApplication, sendApplicationAlert, sniffDoc, MAX_FILE, MIN_REFEREES, DBS, type Referee, type FileIn } from "@/lib/jobs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function applyAction(f: FormData) {
  const v = (k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
  const slug = v("slug", 80).replace(/[^a-z0-9-]/g, "");
  const back = (msg: string) => redirect(`/jobs/${slug}?err=${encodeURIComponent(msg)}#apply`);
  const job = await getJobBySlug(slug);
  if (!job) redirect("/jobs");
  if (v("website")) redirect(`/jobs/${slug}?applied=1#apply`); // bots fill the hidden box
  if (!job!.is_open) back("This vacancy has closed.");

  const name = v("name", 120), email = v("email"), phone = v("phone", 40), location = v("location", 120), subjects = v("subjects", 300);
  const pgce_subject = v("pgce_subject"), pgce_year = v("pgce_year", 10), cover_letter = String(f.get("cover_letter") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 8000);
  if (!name || !EMAIL.test(email) || !phone || !location || !subjects) back("Please fill in all your details, with a valid email address.");
  if (!cover_letter) back("Please add your supporting statement.");
  if (f.get("declaration") !== "on") back("Please tick the declaration.");
  const rtw = v("right_to_work", 3); if (rtw !== "yes" && rtw !== "no") back("Please say whether you have the right to work in the UK.");
  const dbs = v("dbs", 20); if (!DBS.some(([k]) => k === dbs)) back("Please choose your DBS status.");

  // Rule: PGCE evidence is required.
  const file = async (key: string, required: boolean): Promise<FileIn | null> => {
    const x = f.get(key);
    if (!(x instanceof File) || x.size === 0) { if (required) back("Evidence of your PGCE is required. Applications without it can’t be considered."); return null; }
    if (x.size > MAX_FILE) back(`${key === "pgce_file" ? "Your PGCE file" : "Your CV"} is over 3 MB. Please upload a smaller file.`);
    const data = Buffer.from(await x.arrayBuffer()), type = sniffDoc(data);
    const ok = key === "pgce_file" ? ["application/pdf", "image/jpeg", "image/png"] : ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!type || !ok.includes(type)) back(key === "pgce_file" ? "Your PGCE evidence must be a PDF, JPG or PNG." : "Your CV must be a PDF or Word (.docx) file.");
    return { data, type: type!, name: (x.name || "file").replace(/[^\w.\- ]/g, "_").slice(0, 120) };
  };
  if (!pgce_subject || !pgce_year) back("Please give your PGCE subject and the year it was awarded.");
  const pgce = (await file("pgce_file", true))!;
  const cv = await file("cv_file", false);

  // Rule: at least two complete referees, with different email addresses.
  const referees: Referee[] = [];
  for (const n of [1, 2, 3]) {
    const r: Referee = { name: v(`ref${n}_name`, 120), job_title: v(`ref${n}_job_title`, 120), organisation: v(`ref${n}_organisation`, 160),
      email: v(`ref${n}_email`), phone: v(`ref${n}_phone`, 40), relationship: v(`ref${n}_relationship`, 160) };
    const any = Object.values(r).some(Boolean), full = Object.values(r).every(Boolean) && EMAIL.test(r.email);
    if (any && !full) back(`Please complete every box for referee ${n}, with a valid email address.`);
    if (full) referees.push(r);
  }
  if (referees.length < MIN_REFEREES) back("At least two referees are required. Applications without two references can’t be considered.");
  if (new Set(referees.map((r) => r.email.toLowerCase())).size < referees.length) back("Each referee needs their own email address.");
  if (referees.some((r) => r.email.toLowerCase() === email.toLowerCase())) back("A referee can’t have the same email address as you.");

  const id = await saveApplication(job!.id, { name, email, phone, location, subjects, pgce_subject, pgce_year, pgce, cv, cover_letter, right_to_work: rtw === "yes", dbs, referees });
  const h = await headers();
  await sendApplicationAlert(job!, name, id, `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`);
  redirect(`/jobs/${slug}?applied=1#apply`);
}
