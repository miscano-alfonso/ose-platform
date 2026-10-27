import "server-only";
import { withSchool } from "./db";
import { sendHtml } from "./email";

// OH-SO EdTech free-trial requests (/osedtech/trial).
export type Trial = { id: string; name: string; email: string; business: string; website: string; teachers: string; students: string; plan: string; subjects: string; tools: string; message: string; status: string; note: string; created_at: string };
export const TEACHERS = ["Just me", "2–3", "4–8", "9 or more"], STUDENTS = ["Under 20", "20–60", "60–250", "Over 250"];
export const STATUSES = ["new", "contacted", "trial", "customer", "closed"] as const;
const NOTIFY = () => process.env.EDTECH_NOTIFY_EMAIL || "alfonso@ohsoed.co.uk";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function saveTrial(t: Omit<Trial, "id" | "status" | "note" | "created_at">): Promise<void> {
  // at most 5 requests from one address a day (stops repeat submissions)
  const [{ n }] = await withSchool((q) => q<{ n: number }>(`select count(*)::int as n from edtech_trials where email = $1 and created_at > now() - interval '1 day'`, [t.email]));
  if (n >= 5) return;
  await withSchool((q) => q(`insert into edtech_trials (school_id, name, email, business, website, teachers, students, plan, subjects, tools, message)
    values (current_school(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [t.name, t.email, t.business, t.website, t.teachers, t.students, t.plan, t.subjects, t.tools, t.message]));
  const rows = ([["Name", t.name], ["Email", t.email], ["School or business", t.business], ["Website", t.website], ["Teachers", t.teachers], ["Students", t.students], ["Plan", t.plan || "Not sure"], ["Subjects", t.subjects], ["Using now", t.tools], ["Message", t.message]] as [string, string][])
    .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5b6078;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("");
  await sendHtml(`New OH-SO EdTech trial request: ${t.business || t.name}`, `<div style="font:15px/1.5 Arial,sans-serif;color:#12162f"><p><b>Someone wants to try OH-SO EdTech.</b></p><table>${rows}</table><p style="margin-top:14px">It’s also in Admin → Settings → EdTech trials.</p></div>`, [NOTIFY()], "edtech-trial").catch(() => undefined);
}

export async function listTrials(): Promise<Trial[]> {
  return withSchool((q) => q<Trial>(`select id, name, email::text, business, website, teachers, students, plan, subjects, tools, message, status, note, created_at::text from edtech_trials order by created_at desc limit 300`));
}
export async function updateTrial(id: string, status: string, note: string) {
  if (!(STATUSES as readonly string[]).includes(status)) return;
  await withSchool((q) => q(`update edtech_trials set status = $2, note = $3 where id = $1`, [id, status, note.slice(0, 2000)]));
}
