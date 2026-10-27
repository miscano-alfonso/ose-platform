"use server";
import { redirect } from "next/navigation";
import { saveTrial, TEACHERS, STUDENTS } from "@/lib/edtech";

export async function startTrial(form: FormData) {
  const v = (k: string, n = 300) => String(form.get(k) ?? "").replace(/[\x00-\x08\x0B-\x1F]/g, " ").trim().slice(0, n);
  const plan = ["solo", "growth", "school"].includes(v("plan")) ? v("plan") : "";
  if (v("website_url")) redirect("/osedtech/trial?sent=1");   // the hidden box only bots fill in
  const name = v("name", 120), email = v("email", 200).toLowerCase(), business = v("business", 160);
  const back = (e: string) => redirect(`/osedtech/trial?error=${encodeURIComponent(e)}${plan ? `&plan=${plan}` : ""}`);
  if (!name) back("Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("Add an email address we can reach you on.");
  if (!business) back("Add your school or business name (a working name is fine).");
  if (!form.get("agree")) back("Tick the box to say we can contact you about your trial.");
  let site = v("site", 200); if (site && !/^https?:\/\//i.test(site)) site = "https://" + site;
  await saveTrial({ name, email, business, website: site, teachers: TEACHERS.includes(v("teachers")) ? v("teachers") : "", students: STUDENTS.includes(v("students")) ? v("students") : "",
    plan, subjects: v("subjects", 300), tools: v("tools", 300), message: v("message", 3000) });
  redirect("/osedtech/trial?sent=1");
}
