import type { Metadata } from "next";
import Link from "next/link";
import { tasterOptions, TASTER_ACCESS_DAYS, MAX_TASTERS } from "@/lib/tasters-public";
import { siteInfo } from "@/lib/db";
import { bookTasterAction } from "./actions";
import { TasterRows } from "./TasterRows";

export const metadata: Metadata = { title: "Book a free taster", description: "Try a real lesson for free: pick a class and a date, and join the lesson live in Google Meet." };


export default async function Taster({ searchParams }: { searchParams: Promise<{ booked?: string; error?: string }> }) {
  const sp = await searchParams;
  const [opts, site] = await Promise.all([tasterOptions(), siteInfo()]);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Taster Booking</h1><p>Your child joins a real lesson from our timetable, live in Google Meet, with the class and their teacher.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {sp.booked ? <div className="notice ok" role="status"><h2>You’re booked in</h2>
        <p>We’ve emailed you the details. Your child will also get a Google Classroom invitation for each class: please open it and press <b>Join</b> before the lesson.</p>
        <p>Your child can stay in each Classroom until {TASTER_ACCESS_DAYS} days after the taster lesson, to look round the class’s work. After that we take them out automatically, unless you book the course.</p>
        <p><Link href="/courses">Browse our courses</Link></p></div> :
      opts.length === 0 ? <div className="notice"><h2>No taster places just now</h2><p>All our upcoming taster places are taken. <Link href="/contact">Get in touch</Link> and we’ll find a date for you.</p></div> :
      <form className="cform taster" action={bookTasterAction}>
        <p className="tinfo">If a course you’d like a taster for isn’t showing, please <Link href="/contact">contact us</Link>.</p>
        {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
        <TasterRows opts={opts.map((o) => ({ level: o.level, subject: o.subject, lessons: o.lessons }))} max={MAX_TASTERS} />
        <div className="row2">
          <label>Child’s first name<input name="child_name" required maxLength={60} autoComplete="off" /></label>
          <label>Parent/guardian first name<input name="parent_first" required maxLength={60} autoComplete="given-name" /></label>
          <label>Parent/guardian last name<input name="parent_last" required maxLength={60} autoComplete="family-name" /></label>
          <label>Parent/guardian email<input name="parent_email" type="email" required maxLength={200} autoComplete="email" /></label>
        </div>
        <label>Child’s Google account email<input name="child_email" type="email" required maxLength={200} autoComplete="off" placeholder="e.g. name@gmail.com" />
          <span className="note">Lessons run in Google Classroom and Meet, so your child needs their own Google account (Gmail is fine). The Classroom invitation goes here.</span></label>
        <label>Additional message<textarea name="message" rows={4} maxLength={2000} /></label>
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label className="agree"><input type="checkbox" name="agree" required /> I understand my child will be invited to each class’s Google Classroom and can stay for {TASTER_ACCESS_DAYS} days after the taster lesson, to allow time for us to explore the Classroom together. After that, they’ll be taken out unless we book the course.</label>
        {site.demo && <p className="note">This is the demo school: nothing is emailed.</p>}
        <button className="btn btn-brand" type="submit">Send</button>
      </form>}
    </div></section>
  </>);
}
