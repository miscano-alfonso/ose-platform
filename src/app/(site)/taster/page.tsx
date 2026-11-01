import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { tasterOptions, TASTER_ACCESS_DAYS, MAX_TASTERS, parentKids } from "@/lib/tasters-public";
import { currentFamily } from "@/lib/family-auth";
import { siteInfo } from "@/lib/db";
import { bookTasterAction } from "./actions";
import { TasterRows } from "./TasterRows";

export const metadata: Metadata = { title: "Book a free taster", description: "Try a real lesson for free: pick a class and a date, and join the lesson live in Google Meet." };


export default async function Taster({ searchParams }: { searchParams: Promise<{ booked?: string; error?: string }> }) {
  const sp = await searchParams;
  const [opts, site, fam] = await Promise.all([tasterOptions(), siteInfo(), currentFamily()]);
  // 1 Nov: tasters are booked by registered parents, for one of their children
  const parent = fam?.kind === "parent" && !fam.viewer ? fam : null;
  const kids = parent ? await parentKids(parent.id) : [];
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Taster Booking</h1><p>Your child joins a real lesson from our timetable, live in Google Meet, with the class and their teacher.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {sp.booked ? <div className="notice ok" role="status"><h2>You’re booked in</h2>
        <p>We’ve emailed you the details. Your child will also get a Google Classroom invitation for each class: please open it and press <b>Join</b> before the lesson.</p>
        <p>Your child can stay in each Classroom until {TASTER_ACCESS_DAYS} days after the taster lesson, to look round the class’s work. After that we take them out automatically, unless you book the course.</p>
        <p><Link href="/courses">Browse our courses</Link></p></div> :
      !parent ? <div className="notice"><h2>Register to book a taster</h2>
        <p>Tasters are booked from your family account, so we know who your child is and can invite them to Google Classroom. Register your family and add your children (it takes a couple of minutes), or sign in if you already have an account.</p>
        <div className="cd-hbtns"><Link href="/register?next=/taster">Register your family</Link><Link href="/account?next=taster">I already have an account</Link></div></div> :
      kids.length === 0 ? <div className="notice"><h2>Add your child first</h2><p>Add the child the taster is for, with their own Google account email.</p>
        <div className="cd-hbtns"><Link href="/register?next=/taster">Add a child</Link></div></div> :
      opts.length === 0 ? <div className="notice"><h2>No taster places just now</h2><p>All our upcoming taster places are taken. <Link href="/contact">Get in touch</Link> and we’ll find a date for you.</p></div> :
      <form className="cform taster" action={bookTasterAction}>
        <p className="tinfo">If a course you’d like a taster for isn’t showing, please <Link href="/contact">contact us</Link>.</p>
        {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
        <TasterRows opts={opts.map((o) => ({ level: o.level, subject: o.subject, lessons: o.lessons }))} max={MAX_TASTERS} />
        <fieldset className="wk-fs"><legend>Which child is it for?</legend><div className="ct-pills">
          {kids.map((k, i) => <label key={k.id}><input type="radio" name="child" value={k.id} required defaultChecked={kids.length === 1 && i === 0} /><span>{k.first}</span></label>)}</div>
          <p className="note">The Classroom invitation goes to your child’s Google account: {kids.map((k) => `${k.first}: ${k.email ?? "not given yet"}`).join(" · ")}. <Link href="/register?next=/taster">+ Add a child</Link></p></fieldset>
        <p className="note">Booking as {parent.first} {parent.last} · {parent.email}</p>
        <label>Additional message<textarea name="message" rows={4} maxLength={2000} /></label>
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label className="agree"><input type="checkbox" name="agree" required /> I understand my child will be invited to each class’s Google Classroom and can stay for {TASTER_ACCESS_DAYS} days after the taster lesson, to allow time for us to explore the Classroom together. After that, they’ll be taken out unless we book the course.</label>
        <p className="note">We’ll use these details for the taster and to follow up about it. See our <Link href="/privacy">privacy notice</Link>.{site.demo ? " This is the demo school: nothing is emailed." : ""}</p>
        <button className="btn btn-brand" type="submit">Send</button>
      </form>}
    </div></section>
  </>);
}
