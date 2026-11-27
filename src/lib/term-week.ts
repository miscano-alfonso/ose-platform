import "server-only";
import { withSchool } from "./db";

// 27 Nov: the hero's "Term 2 · Week 4" for any date (weeks count Monday to Sunday from the term's start), shared by
// the teacher, student and parent dashboards.
const monday = (x: string) => { const t = new Date(x + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.getTime(); };
export function termWeekOf(date: string, termNo: number | null | undefined, termStart: string | null | undefined): string {
  return termNo && termStart ? `Term ${termNo} · Week ${Math.floor((monday(date) - monday(termStart)) / 6048e5) + 1}` : "";
}
export async function termWeekFor(date: string | null | undefined): Promise<string> {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [t] = await withSchool((q) => q<{ n: number; s: string }>(`select t.number as n, t.starts_on::text as s from terms t join academic_years y on y.id = t.academic_year_id
    where $1::date between t.starts_on and t.ends_on order by t.starts_on limit 1`, [date])).catch(() => []);
  return t ? termWeekOf(date, t.n, t.s) : "";
}
/** "Friday 27 Nov · 09:30" for today, "Tue 1 Dec · 09:30" otherwise (London dates). */
export function heroWhen(date: string, time: string, today: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = d.toLocaleDateString("en-GB", { weekday: date === today ? "long" : "short", timeZone: "UTC" });
  return `${day} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} · ${time.slice(0, 5)}`;
}
