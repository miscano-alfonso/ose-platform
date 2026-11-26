import type { Metadata } from "next";
import Link from "next/link";
import { joinInfo } from "@/lib/waitlist-join";
import { joinWaitlistAction } from "../actions";

export const metadata: Metadata = { title: "Join the waiting list", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The link in the email after a taster in a trial class opens this page; the button adds the child to the waiting list.
// (Email scanners that open links don't press buttons, so a scanner can't sign anyone up.)
export default async function JoinWaitlist({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const i = await joinInfo(t).catch(() => null);
  const box = (body: React.ReactNode) => <section className="s-sec"><div className="wrap"><div className="login" style={{ maxWidth: 560 }}>{body}</div></div></section>;
  if (!i) return box(<><h1 style={{ marginTop: 0 }}>Join the waiting list</h1><p>This link isn’t working. Please <Link href="/contact">get in touch</Link> and we’ll add you to the list.</p></>);
  const left = Math.max(i.needed - i.count, 0);
  const course = <Link href={`/courses/${i.slug}`}>{i.cls}</Link>;
  if (i.status === "open" && !i.trial) return box(<><h1 style={{ marginTop: 0 }}>{i.cls} is open</h1>
    <p>Good news: {course} is now running and open for booking.</p><p><Link className="btn btn-brand" href={`/courses/${i.slug}`}>Book {i.child}’s place</Link></p></>);
  if (i.joined) return box(<><h1 style={{ marginTop: 0 }}>{i.child} is on the waiting list</h1>
    {i.status === "priority"
      ? <><p>Good news: enough families have signed up, so {course} is going ahead. As you’re on the waiting list, you can book {i.child}’s place before it opens to everyone. We’ve emailed you the details.</p>
          <p><Link className="btn btn-brand" href={i.entry ? `/waitlist/book?w=${i.entry}` : `/courses/${i.slug}`}>Book {i.child}’s place</Link></p></>
      : <><p>Thank you, {i.parent}. Please note that {i.cls} only goes ahead once <b>{i.needed} families</b> have signed up.</p>
          <p>So far <b>{i.count} of {i.needed}</b> families have signed up{left ? `, so we need ${left} more` : ""}.</p>
          <p>We’ll email you as soon as the course is going ahead, and you’ll be able to book {i.child}’s place before anyone else. There’s nothing to pay until then. If you know anyone who might be interested, do tell them.</p></>}</>);
  return box(<form action={joinWaitlistAction}><input type="hidden" name="t" value={t} />
    <h1 style={{ marginTop: 0 }}>Join the waiting list for {i.cls}</h1>
    <p>Thank you for trying {course} with us, {i.parent}.</p>
    <p>This is a new course, and it only starts once <b>{i.needed} families</b> have signed up. So far {i.count} {i.count === 1 ? "has" : "have"}.</p>
    <p>Joining the waiting list is free and doesn’t commit you to anything. When enough families have joined, we’ll email you and you can book {i.child}’s place before it opens to everyone.</p>
    <button className="btn btn-brand" type="submit">Add {i.child} to the waiting list</button></form>);
}
