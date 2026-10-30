import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/app/(site)/HoverLink";
import { getWorkshops } from "@/lib/data";
import { money } from "@/lib/format";
import { requestWorkshop } from "./actions";

export const dynamic = "force-dynamic";
const find = async (slug: string) => (await getWorkshops()).find((w) => w.slug === slug);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const YEARS = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Other"];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const w = await find((await params).slug);
  return w ? { title: w.title, description: w.summary?.slice(0, 160) ?? `A live online workshop with OH-SO ED.` } : { title: "Workshop" };
}

// A workshop's own page with its booking form (31 Oct, replacing the old site's "news" post and checkout).
export default async function WorkshopPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sent?: string; error?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const w = await find(slug);
  if (!w) notFound();
  const full = w.places_left === 0;
  const price = w.price_pence === 0 ? "Free" : money(w.price_pence);
  return (<>
    <section className="s-phead"><div className="wrap">
      <h1>{w.title}</h1>
      <p>{day(w.starts_at)} · {time(w.starts_at)} · {w.minutes} minutes{w.teacher ? ` · ${w.teacher}` : ""}</p>
      <div className="cd-hbtns"><Link href="/other-services?tag=workshops">← All workshops</Link>{!full && <a href="#book">Book a place</a>}</div>
    </div></section>
    {/* once the title panel scrolls up, a slim band with the title and the buttons stays under the menu (as on course pages) */}
    <div className="cd-sticky wk-sticky"><div className="cd-stitle"><b>{w.title}</b></div>
      <div className="cd-hbtns"><Link href="/other-services?tag=workshops" tabIndex={-1}>← All workshops</Link>{!full && <a href="#book" tabIndex={-1}>Book a place</a>}</div></div>
    <section className="s-sec wk-sec"><div className="wrap wk-grid">
      <article className="wk-tile" style={w.colour ? { ["--c" as string]: w.colour } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {w.image && <div className="wk-pic"><img src={w.image} alt="" width={1280} height={720} /></div>}
        <p className="mc-tags"><span className="mc-tag t-work">Workshop</span>{w.level && <span className="mc-tag">{w.level}</span>}{w.subject && <span className="mc-tag">{w.subject}</span>}</p>
        {w.summary && <p className="wk-sum">{w.summary}</p>}
        <table className="cd-table wk-facts"><tbody>
          <tr><th>Date</th><td>{day(w.starts_at)}</td></tr>
          <tr><th>Time</th><td>{time(w.starts_at)} (UK time)</td></tr>
          <tr><th>Length</th><td>{w.minutes} minutes</td></tr>
          <tr><th>Where</th><td>Live online</td></tr>
          {w.teacher && <tr><th>Teacher</th><td>{w.teacher}</td></tr>}
          {w.level && <tr><th>Level</th><td>{w.level}</td></tr>}
          {w.places_left !== null && <tr><th>Places</th><td>{full ? "Full" : w.places_left <= 3 ? `${w.places_left} left` : "Available"}</td></tr>}
          <tr><th>Price</th><td><b>{price}</b>{w.enrolled_price_pence !== null && w.enrolled_price_pence < w.price_pence ? ` · ${w.enrolled_price_pence === 0 ? "free" : money(w.enrolled_price_pence)} for our students` : ""}</td></tr>
        </tbody></table>
      </article>
      <div id="book" className="wk-book">
        {sp.sent ? <div className="ct-form wk-done" role="status"><p className="ab-k">Booking received</p><h2>Thank you, we’ll be in touch</h2>
          <p>We’ve got your request for {w.title}. We’ll email you to confirm the place{w.price_pence > 0 ? " and send a payment link" : ""}, with the link to join on the day.</p>
          <div className="cd-hbtns"><Link href="/other-services">Back to More</Link></div></div>
        : full ? <div className="ct-form wk-done"><p className="ab-k">Workshop full</p><h2>This one is full</h2><p>All the places have gone. <Link href="/contact">Get in touch</Link> and we’ll tell you when we run it again.</p></div>
        : <form action={requestWorkshop} className="cform ct-form">
          <p className="ab-k">Book a place</p>
          <h2>{price === "Free" ? "Book a free place" : `Book a place · ${price}`}</h2>
          {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
          <input type="hidden" name="slug" value={w.slug} />
          <div className="row2"><label>Parent first name<input name="first" autoComplete="given-name" required maxLength={80} /></label>
            <label>Parent last name<input name="last" autoComplete="family-name" required maxLength={80} /></label></div>
          <div className="row2"><label>Parent email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
            <label>Child’s name<input name="child" required maxLength={120} /></label></div>
          <fieldset className="wk-fs"><legend>Child’s year group</legend><div className="ct-pills">
            {YEARS.map((y) => <label key={y}><input type="radio" name="year" value={y} /><span>{y}</span></label>)}</div></fieldset>
          <fieldset className="wk-fs"><legend>Does your child already study with us?</legend><div className="ct-pills">
            <label><input type="radio" name="ours" value="yes" /><span>Yes</span></label><label><input type="radio" name="ours" value="no" /><span>No</span></label></div></fieldset>
          <label>Anything we should know? <small className="note">optional</small><textarea name="message" rows={3} maxLength={2000} /></label>
          <label className="hp" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <p className="note">We’ll email you to confirm the place{w.price_pence > 0 ? " and send a payment link" : ""}, and the link to join on the day.</p>
          <button className="wk-go" type="submit">Book my place</button>
        </form>}
      </div>
    </div></section>
  </>);
}
