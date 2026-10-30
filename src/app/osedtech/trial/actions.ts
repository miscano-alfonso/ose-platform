"use server";
import { redirect } from "next/navigation";
import { saveTrial, TEACHERS, STUDENTS, GOOGLE } from "@/lib/edtech";
import { requestTrialAccount } from "@/lib/edtech-account";
import { VIDEO_TOOLS } from "@/lib/video";

/** Solo and Growth: the visitor opens their own trial school (we email a link to confirm their address first).
 *  School: a request, and we set it up with them. */
export async function startTrial(form: FormData) {
  const v = (k: string, n = 300) => String(form.get(k) ?? "").replace(/[\x00-\x08\x0B-\x1F]/g, " ").trim().slice(0, n);
  const plan = ["solo", "growth", "school"].includes(v("plan")) ? v("plan") as "solo" | "growth" | "school" : "solo";
  if (v("website_url")) redirect(`/osedtech/trial?plan=${plan}&${plan === "school" ? "sent" : "check"}=1`);   // the hidden box only bots fill in
  const name = v("name", 120), email = v("email", 200).toLowerCase(), business = v("business", 160);
  const back = (e: string) => redirect(`/osedtech/trial?plan=${plan}&error=${encodeURIComponent(e)}`);
  if (!name) back("Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("Add an email address we can reach you on.");
  if (!business) back("Add your school or business name (a working name is fine).");
  if (!form.get("agree")) back(plan === "school" ? "Tick the box to say we can contact you about your trial." : "Tick the box to agree to the trial terms.");
  const pick = (k: string, list: string[]) => list.includes(v(k)) ? v(k) : "";
  if (plan !== "school") {
    const err = await requestTrialAccount({ name, email, business, plan, google: pick("google", GOOGLE), teachers: pick("teachers", TEACHERS), students: pick("students", STUDENTS), subjects: v("subjects", 300), video: VIDEO_TOOLS.some((x) => x.id === v("video")) ? v("video") : "" });
    if (err) back(err);
    redirect(`/osedtech/trial?plan=${plan}&check=1&to=${encodeURIComponent(email)}`);
  }
  let site = v("site", 200); if (site && !/^https?:\/\//i.test(site)) site = "https://" + site;
  await saveTrial({ name, email, business, website: site, teachers: pick("teachers", TEACHERS), students: pick("students", STUDENTS),
    plan, subjects: v("subjects", 300), tools: [v("tools", 300), VIDEO_TOOLS.find((x) => x.id === v("video")) ? `Video: ${VIDEO_TOOLS.find((x) => x.id === v("video"))!.name}` : ""].filter(Boolean).join(" · "), google: pick("google", GOOGLE), message: v("message", 3000) });
  redirect("/osedtech/trial?plan=school&sent=1");
}
