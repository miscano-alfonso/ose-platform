import type { Metadata } from "next";
import { getTerms } from "@/lib/data";
import { dayMonth, monthYear, yearLabel, weeks } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Term dates", description: "Six terms a year, the breaks between them and when each termly payment is taken." };

export default async function TermDates() {
  const terms = await getTerms();
  const today = new Date().toISOString().slice(0, 10);
  const years = [...new Set(terms.map((t) => t.year_label))];
  const next = terms.find((t) => t.starts_on > today);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Term Dates</h1><p>Six terms a year, with a break after each one. There are no lessons or payments in the breaks.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {years.map((y) => { const ts = terms.filter((t) => t.year_label === y);
        return <div className="tyear" key={y}>
          {years.length > 1 && <h2 className="tyh">{yearLabel(y)}{ts[0].is_next && <span className="tynew">Starts {monthYear(ts[0].year_start)} · now booking</span>}</h2>}
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
