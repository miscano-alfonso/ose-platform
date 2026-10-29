import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getWorkshops } from "@/lib/data";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Other services", description: "Past paper marking with written feedback, and one-off workshops for home-educated students." };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function OtherServices() {
  const workshops = await getWorkshops();
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Other Services</h1><p>Exam paper marking and one-off workshops, open to every family.</p></div></section>
    <section className="s-sec"><div className="wrap">
      <div className="sec-head"><h2>Past Paper Marking</h2></div>
      <div className="svc">
        <div className="svc-body">
          <h3>IGCSE English Language and Literature</h3>
          <p>We mark past papers from all exam boards and return them within 48 hours, with written feedback and targets for improvement.</p>
        </div>
        <div className="svc-buy"><span className="price">{money(2000)}</span><small>per paper</small>
          <Link className="btn btn-brand" href="/contact?about=past-paper-marking">Submit form</Link></div>
      </div>
    </div></section>
    <section className="s-sec" style={{ background: "var(--mist)" }}><div className="wrap">
      <div className="sec-head"><h2>Workshops</h2><p>One-off live sessions. Places are limited.</p></div>
      {workshops.length === 0 ? <p className="empty">There are no workshops booked in at the moment. Check back soon, or <Link href="/contact">ask us</Link> to let you know when the next one opens.</p> :
        <div className="cgrid">{workshops.map((w) => <article className="course" key={w.slug}>
          {w.places_left !== null && w.places_left <= 3 && <span className={`sticky ${w.places_left === 0 ? "sl-almost" : "sl-few"}`}>{w.places_left === 0 ? "Full" : "Few spaces left"}</span>}
          <div><div className="lvl">{[w.level, w.subject].filter(Boolean).join(" · ") || "Workshop"}</div><h3>{w.title}</h3></div>
          {w.summary && <p className="when">{w.summary}</p>}
          <ul className="slots"><li>{when(w.starts_at)}</li><li className="dur">{w.minutes} minutes{w.teacher ? ` · ${w.teacher}` : ""}</li></ul>
          <div className="price">{w.price_pence === 0 ? "Free" : money(w.price_pence)}
            {w.enrolled_price_pence !== null && w.enrolled_price_pence < w.price_pence && <small> · {w.enrolled_price_pence === 0 ? "free" : money(w.enrolled_price_pence)} for enrolled students</small>}</div>
          <div className="cbtns"><span className="btn btn-brand sm" aria-disabled="true" title="Online booking opens soon">Book now</span></div>
        </article>)}</div>}
    </div></section>
  </>);
}
