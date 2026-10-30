import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { notFound } from "next/navigation";
import { getCoursePage } from "@/lib/data";
import { money, DAYS, monthYear } from "@/lib/format";
import { roundelSrc } from "../../../CourseCard";
import { siteInfo } from "@/lib/db";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ level: string; subject: string }> }): Promise<Metadata> {
  const { level, subject } = await params;
  const p = await getCoursePage(`${level}/${subject}`);
  return p ? { title: `${p.level} ${p.subject}`, description: `${p.level} ${p.subject} online course: lesson times, price, teacher and topics.` } : { title: "Course" };
}

/** Lines starting "- " become a bullet list; other lines are paragraphs. */
function Text({ text }: { text: string }) {
  const out: React.ReactNode[] = []; let list: string[] = [];
  const flush = () => { if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>); list = []; };
  for (const line of text.split("\n")) { if (line.trim().startsWith("- ")) list.push(line.trim().slice(2)); else { flush(); if (line.trim()) out.push(<p key={out.length}>{line}</p>); } }
  flush(); return <>{out}</>;
}

export default async function CoursePage({ params }: { params: Promise<{ level: string; subject: string }> }) {
  const { level, subject } = await params;
  const [p, site] = await Promise.all([getCoursePage(`${level}/${subject}`), siteInfo()]);
  if (!p) notFound();
  const g = p.groups[0];
  return (<>
    <section className="s-phead"><div className="wrap cd-head">
      <div><p className="eyebrow"><Link href={`/courses?level=${encodeURIComponent(p.level)}`}>← Back to courses</Link></p>
        <h1>{p.subject}</h1><p>{p.level}{g ? ` · ${g.course_years} year course` : ""}</p></div>
    </div></section>
    <section className="s-sec"><div className="wrap cd-grid">
      <div className="roundel cd-roundel" style={{ ["--c" as string]: p.colour }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={roundelSrc(p.subject, site.demo)} alt="" width={140} height={140} /></div>
      <div>
        <h2 className="cd-h">Course details</h2>
        {p.groups.length === 0 ? <p>This course isn’t running at the moment. <Link href="/contact">Get in touch</Link> to hear when it opens.</p> : p.groups.map((c) => <div key={c.code} className="cd-card">
          {p.groups.length > 1 && <h3>{c.year_label.replace("/", "–")}{c.is_next ? ` · starts ${monthYear(c.year_start)}` : ""}</h3>}
          <table className="cd-table"><tbody>
            {c.status === "waitlist" ? <tr><th>Day &amp; time</th><td>Announced when the course opens</td></tr>
              : (c.slots ?? []).map((s, i) => <tr key={i}><th>Day &amp; time{(c.slots?.length ?? 0) > 1 ? ` ${i + 1}` : ""}</th><td>{DAYS[s.d]} – {s.t}</td></tr>)}
            <tr><th>Level</th><td>{c.level}</td></tr>
            {p.exam_board && <tr><th>Exam board</th><td>{p.exam_board}</td></tr>}
            <tr><th>Course duration</th><td>{c.course_years} year{c.course_years > 1 ? "s" : ""}</td></tr>
            <tr><th>Lesson duration</th><td>45 mins</td></tr>
            <tr><th>Lessons per week</th><td>{c.lessons_per_week}</td></tr>
            <tr><th>Price</th><td><b>{money(c.course_total_pence)}</b></td></tr>
          </tbody></table>
          {c.teacher && <div className="cd-teacher">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.teacher_photo && <img src={c.teacher_photo} alt="" width={72} height={72} />}
            <div><span>{p.subject} teacher</span>{c.teacher_slug ? <Link href={`/teachers/${c.teacher_slug}`}><b>{c.teacher}</b></Link> : <b>{c.teacher}</b>}</div></div>}
          <div className="cd-btns">
            {c.label && <span className="sticky sl-few" style={{ position: "static" }}>{c.label_text ?? c.label}</span>}
            <span className={`btn ${c.shows_waitlist ? "btn-line" : "btn-brand"}`} aria-disabled="true" title="Booking opens in the next update">{c.shows_waitlist ? "Join waiting list" : "Add to cart"}</span>
          </div>
        </div>)}
        {p.video && <div className="cd-video"><h2 className="cd-h">Sample lesson</h2><Video url={p.video} title={p.video_title ?? `${p.level} ${p.subject} sample lesson`} />
          {p.video_title && <p className="muted">{p.video_title}</p>}</div>}
        <div className="cd-tools"><Link className="btn btn-line sm" href="/courses">Back to courses</Link><PrintButton /></div>
      </div>
      <div>
        <h2 className="cd-h">Topics</h2>
        {p.intro && <p>{p.intro}</p>}
        {p.topics.length === 0 ? <p className="muted">Topics will be added soon.</p> : <div className="cd-topics">{p.topics.map((t, i) => <div key={i} className="cd-topic"><h3>{t.title}</h3><Text text={t.text} /></div>)}</div>}
      </div>
    </div></section>
  </>);
}

/** A recorded lesson: Google Drive and YouTube links play in their own player; anything else as a video file. */
function Video({ url, title }: { url: string; title: string }) {
  const drive = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url)?.[1];
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/.exec(url)?.[1];
  if (drive || yt) return <div className="cd-frame"><iframe src={drive ? `https://drive.google.com/file/d/${drive}/preview` : `https://www.youtube-nocookie.com/embed/${yt}`}
    title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>;
  return <video className="cd-player" controls preload="metadata" playsInline src={url} aria-label={title}>Your browser can’t play this video.</video>;
}
