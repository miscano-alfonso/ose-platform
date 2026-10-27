import type { Metadata } from "next";
import Link from "next/link";
import { tasterOptions, TASTER_ACCESS_DAYS, MAX_TASTERS } from "@/lib/tasters-public";
import { siteInfo } from "@/lib/db";
import { bookTasterAction } from "./actions";

export const metadata: Metadata = { title: "Book a free taster", description: "Try a real lesson for free: pick a class and a date, and join the lesson live in Google Meet." };

const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function Taster({ searchParams }: { searchParams: Promise<{ booked?: string; error?: string }> }) {
  const sp = await searchParams;
  const [opts, site] = await Promise.all([tasterOptions(), siteInfo()]);
  const levels = [...new Set(opts.map((o) => o.level))];
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Book a Free Taster</h1><p>Your child joins a real lesson from our timetable, live in Google Meet, with the class and their teacher.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {sp.booked ? <div className="notice ok" role="status"><h2>You’re booked in</h2>
        <p>We’ve emailed you the details. Your child will also get a Google Classroom invitation for each class: please open it and press <b>Join</b> before the lesson.</p>
        <p>Your child can stay in each Classroom until {TASTER_ACCESS_DAYS} days after the taster lesson, to look round the class’s work. After that we take them out automatically, unless you book the course.</p>
        <p><Link href="/courses">Browse our courses</Link></p></div> :
      opts.length === 0 ? <div className="notice"><h2>No taster places just now</h2><p>All our upcoming taster places are taken. <Link href="/contact">Get in touch</Link> and we’ll find a date for you.</p></div> :
      <form className="cform taster" action={bookTasterAction}>
        {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
        <fieldset><legend>1. Choose up to {MAX_TASTERS} classes and a date for each</legend>
          <p className="note">Only lessons with free taster places are shown, for the next five weeks.</p>
          {levels.map((lv) => <div key={lv} className="tlevel"><h3>{lv}</h3>
            <div className="tgrid">{opts.filter((o) => o.level === lv).map((o) => <label key={o.id} className="tclass" style={{ ["--c" as string]: o.colour }}>
              <span className="tname"><b>{o.subject}</b>{o.teacher && <small>with {o.teacher}</small>}</span>
              <select name={`lesson_${o.id}`} defaultValue="" aria-label={`${o.level} ${o.subject}: date`}>
                <option value="">Not this one</option>
                {o.lessons.map((l) => <option key={l.id} value={l.id}>{day(l.date)} · {l.starts}–{l.ends}{l.places === 1 ? " · last place" : ""}</option>)}
              </select></label>)}</div></div>)}
        </fieldset>
        <fieldset><legend>2. Your child</legend>
          <div className="row2">
            <label>Child’s first name<input name="child_name" required maxLength={60} autoComplete="off" /></label>
            <label>Child’s Google account email<input name="child_email" type="email" required maxLength={200} autoComplete="off" placeholder="e.g. name@gmail.com" /></label>
          </div>
          <p className="note">Lessons run in Google Classroom and Meet, so your child needs their own Google account (a Gmail address is fine). The Classroom invitation goes to this address.</p>
        </fieldset>
        <fieldset><legend>3. You</legend>
          <div className="row2">
            <label>Your first name<input name="parent_first" required maxLength={60} autoComplete="given-name" /></label>
            <label>Your last name<input name="parent_last" required maxLength={60} autoComplete="family-name" /></label>
          </div>
          <label>Your email<input name="parent_email" type="email" required maxLength={200} autoComplete="email" /></label>
          <label>Anything we should know? <span className="note">(optional)</span><textarea name="message" rows={3} maxLength={2000} /></label>
        </fieldset>
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label className="agree"><input type="checkbox" name="agree" required /> I understand my child will be invited to each class’s Google Classroom and taken out {TASTER_ACCESS_DAYS} days after the taster lesson, unless we book the course.</label>
        <p className="note">Taster lessons are free. We’ll only use your details for this booking and to follow up about it. {site.demo ? "This is the demo school: nothing is emailed." : ""}</p>
        <button className="btn btn-brand" type="submit">Book my free taster</button>
      </form>}
    </div></section>
  </>);
}
