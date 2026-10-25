import "server-only";
import { withSchool } from "./db";
import { FAQS } from "@/content/faq";

// Text the office can change in Admin → Website. Anything not set uses these defaults.
export const DEFAULTS: Record<string, string> = {
  home_eyebrow: "Online school for home-educated students",
  home_title: "Outstanding Teaching Inspiring Future Generations",
  home_lead: "OH-SO ED provides outstanding online education for home-educated students. We offer KS3, pre-GCSE and GCSE courses taught by experienced secondary subject specialists, supported by our 98% GCSE pass rate!",
  ticker: "Join us for taster lessons\nNew courses will start in September",
  teachers_intro: "Experienced secondary subject specialists, all with up-to-date DBS certificates.",
};

export async function siteText(): Promise<Record<string, string>> {
  try {
    const rows = await withSchool((q) => q<{ key: string; value: string }>(`select key, value from site_content`));
    return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  } catch { return DEFAULTS; }
}

export type Faq = { id: string; question: string; answer: string; sort_order: number; published: boolean };
export async function getFaqs(all = false): Promise<Faq[]> {
  try {
    const rows = await withSchool((q) => q<Faq>(`select id, question, answer, sort_order, published from faqs where $1 or published order by sort_order, question`, [all]));
    return rows.length || all ? rows : FAQS.map((f, i) => ({ id: String(i), question: f.q, answer: f.a, sort_order: i, published: true }));
  } catch { return FAQS.map((f, i) => ({ id: String(i), question: f.q, answer: f.a, sort_order: i, published: true })); }
}

export async function saveSiteText(actorId: string, values: Record<string, string>) {
  await withSchool(async (q) => {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in DEFAULTS)) continue;
      if (!v.trim() || v.trim() === DEFAULTS[k]) await q(`delete from site_content where key = $1`, [k]);
      else await q(`insert into site_content (school_id, key, value, updated_by) values (current_school(), $1, $2, $3) on conflict (school_id, key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`, [k, v.trim(), actorId]);
    }
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, 'update', 'site_content', $2)`, [actorId, JSON.stringify(Object.keys(values))]);
  });
}

export async function saveFaq(actorId: string, id: string | null, d: { question: string; answer: string; sort: number; published: boolean }) {
  await withSchool(async (q) => {
    if (id) await q(`update faqs set question = $2, answer = $3, sort_order = $4::int, published = $5::boolean where id = $1`, [id, d.question, d.answer, d.sort, d.published]);
    else await q(`insert into faqs (school_id, question, answer, sort_order, published) values (current_school(), $1, $2, $3::int, $4::boolean)`, [d.question, d.answer, d.sort, d.published]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'save', 'faq', $2)`, [actorId, id]);
  });
}
export async function deleteFaq(actorId: string, id: string) {
  await withSchool(async (q) => { await q(`delete from faqs where id = $1`, [id]); await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id) values (current_school(), $1, 'delete', 'faq', $2)`, [actorId, id]); });
}
