import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getTerms } from "@/lib/data";
import { dayMonth, monthYear, weeks } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Term dates", description: "Six terms a year, the breaks between them and when each termly payment is taken." };

/** "2026/27" (also from "2026-27") and the year after it. */
const slash = (y: string) => y.replace(/[-–]/, "/");
const after = (y: string) => { const n = Number(y.slice(0, 4)); return Number.isFinite(n) ? `${n + 1}/${String((n + 2) % 100).padStart(2, "0")}` : ""; };

export default async function TermDates({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const terms = await getTerms();
  const today = new Date().toISOString().slice(0, 10);
  const years = [...new Set(terms.map((t) => t.year_label))];
  const next = terms.find((t) => t.starts_on > today);
  // one school year at a time, chosen with the buttons in the title panel; the year after the last one shows as "Coming soon"
  const current = years.find((y) => terms.some((t) => t.year_label === y && t.starts_on <= today && t.ends_on >= today)) ?? years[0];
  const yr = years.find((y) => slash(y) === slash(sp.year ?? "")) ?? current;
  const coming = years.length ? after(slash(years[years.length - 1])) : "";
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Term Dates</h1><p>Six terms each school year, with a break after each one. There are no lessons or payments in the breaks.</p></div></section>
    <div className="ph-sticky"><nav className="tabs ph-tabs" aria-label="School year">
        {years.map((y) => <Link key={y} href={`/term-dates?year=${encodeURIComponent(slash(y))}`} scroll={false} className={y === yr ? "on" : ""} aria-current={y === yr ? "page" : undefined}>{slash(y)}</Link>)}
        {coming && <span className="ph-soon" tabIndex={0} aria-label={`${coming}: coming soon`}><span>{coming}</span><span>Coming soon</span></span>}</nav></div>
    <section className="s-sec"><div className="wrap">
      {years.filter((y) => y === yr).map((y) => { const ts = terms.filter((t) => t.year_label === y);
        return <div className="tyear" key={y}>
          <h2 className="tyh"><span className="sr-only">{slash(y)} </span>{ts[0].is_next ? <span className="tynew">Starts {monthYear(ts[0].year_start)} · now booking</span> : ts.some((t) => t.starts_on <= today) && ts.some((t) => t.ends_on >= today) ? <span className="tynow">This school year</span> : null}</h2>
          <div className="terms">{ts.map((t) => { const now = t.starts_on <= today && t.ends_on >= today;
            return <div className={`term${now ? " now" : ""}`} key={y + t.number}>
              <div className="tn"><b>{t.name}</b><span>{weeks(t.starts_on, t.ends_on)} weeks{now ? " · this term" : t === next ? " · next" : ""}</span></div>
              <div className="td"><span className="lab">Lessons</span><b>{dayMonth(t.starts_on)} – {dayMonth(t.ends_on)}</b></div>
              <div className="td"><span className="lab">Payment</span><b>{t.number === 1 ? "On enrolment" : `Taken ${dayMonth(t.bills_on)}`}</b></div>
              <div className="td brk"><span className="lab">Break</span><span>{t.break_start ? `${dayMonth(t.break_start)} – ${dayMonth(t.break_end!)}` : "Summer holiday"}</span></div>
            </div>; })}</div></div>; })}
      <p className="ttnote">Termly payments are taken 2 weeks before each new term starts. Term 1 is paid when you enrol.</p>
    </div></section>
  </>);
}
