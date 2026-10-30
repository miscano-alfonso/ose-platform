import Link from "@/app/(site)/HoverLink";
import { ReviewsWidget } from "./ReviewsWidget";

// Bottom of the homepage, as on ohsoed.co.uk: Meet the Headteacher, Facebook reviews and Member Of.
export function MeetHead({ title, text, photo = true, bento = false }: { title: string; text: string; photo?: boolean; bento?: boolean }) {
  // the school website (update 230): one tile, photo on the left, name and role, then Leanne's words
  if (bento) return <section className="s-sec home-head2"><div className="wrap"><div className="hh-tile">
    <div className="hh-side"><div className="hh-name"><p className="hh-k">{title}</p><h2>Leanne Iacurci</h2><p className="hh-role">Principal and English Teacher</p></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <div className="hh-photo"><img src="/teachers/leanne-iacurci.webp" alt="Leanne Iacurci, Principal and English Teacher" width={640} height={345} loading="lazy" /></div>}</div>
    <div className="hh-body">
      <div className="hh-text">{text.split("\n").filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="btns"><Link className="btn btn-brand" href="/about">More about us</Link><Link className="btn btn-ghost hub-ghost" href="/teachers">Meet the team</Link></div></div>
  </div></div></section>;
  return <section className="s-sec home-head"><div className="wrap">
    <div className="sec-head"><h2>{title}</h2></div>
    <div className="head-grid">
      <div className="head-text">{text.split("\n").filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
        <div className="btns"><Link className="btn btn-brand" href="/about">More about us</Link><Link className="btn btn-ghost hub-ghost" href="/teachers">Meet the team</Link></div></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img className="head-photo" src="/teachers/leanne-iacurci.webp" alt="Leanne Iacurci, Principal and English Teacher" width={640} height={345} loading="lazy" />}
    </div>
  </div></section>;
}

/** The Facebook reviews widget the current site uses (Elfsight), with a plain link if it can't load. */
export function Reviews({ url, widget, rating, count }: { rating?: string; count?: string; url: string; widget: string }) {
  return <section className="s-sec home-reviews"><div className="wrap">
    <div className="sec-head"><h2>What our customers say</h2></div>
    <ReviewsWidget widget={widget} url={url} rating={rating} count={count} />
  </div></section>;
}

export function MemberOf() {
  const out = { target: "_blank", rel: "noopener noreferrer" } as const;
  return <section className="s-sec home-member"><div className="wrap">
    <div className="sec-head"><h2>Member Of</h2></div>
    <div className="member-grid">
      <article className="member-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/member-tta.webp" alt="The Tutors' Association corporate member 2025–26" width={600} height={327} loading="lazy" />
        <p>We’re proud to be a member of <a href="https://thetutorsassociation.org.uk/" {...out}>The Tutors’ Association (TTA)</a>, the UK’s professional body for tutors. It means we follow a clear code of practice, stay up to date with the best teaching methods, and are committed to a safe, supportive, high-quality learning experience, so you can feel confident your child’s education is in good hands.</p>
      </article>
      <article className="member-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/member-te.webp" alt="Tutors & Exams: Opening Learning Doors" width={600} height={600} loading="lazy" />
        <p>OH-SO ED is an approved Learning Partner of <a href="https://www.tutorsandexams.uk/" {...out}>Tutors &amp; Exams</a>, who have <a href="https://www.tutorsandexams.uk/exam-centres/gcse-exam-centres/" {...out}>exam centres</a> around the country, all approved by the <a href="https://www.jcq.org.uk/" {...out}>Joint Council for Qualifications</a>. Our students who sit their exams as private candidates with Tutors &amp; Exams get 15% off the exam entry price and access to specialist SEN staff for access arrangements.</p>
        <p className="member-links"><a href="https://www.tutorsandexams.uk/exam-centres/entry-deadline-dates/" {...out}>Entry deadline dates</a> · <a href="https://www.tutorsandexams.uk/access-arrangements/#deadlines" {...out}>Access arrangement deadlines</a> · <Link href="/home-ed#exams">Exams help</Link></p>
      </article>
    </div>
  </div></section>;
}
