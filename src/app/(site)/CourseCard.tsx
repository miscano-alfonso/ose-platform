import Link from "next/link";
import type { Course } from "@/lib/data";
import { money, DAYS, monthYear } from "@/lib/format";

const LABEL_CLASS: Record<string, string> = { "Few spaces left": "few", "Almost full": "almost", "New Group!": "new", "New Group Launching Soon!": "soon" };

// The subject roundels used on ohsoed.co.uk (files in public/roundels, named as in the OSE Drive folder).
const ROUNDEL: [RegExp, string][] = [
  [/english/i, "OSE English Roundel.png"],
  [/french|spanish|german|italian|latin|language/i, "OSE Language Roundel.png"],
  [/math/i, "OSE Maths Roundel.png"],
  [/science|biology|chemistry|physics/i, "OSE Science Roundel.png"],
  [/geography/i, "OSE Geography Roundel.png"],
  [/history/i, "OSE History Roundel.png"],
  [/business/i, "OSE Business Roundel.png"],
  [/economics/i, "OSE Economics Roundel.png"],
  [/media/i, "OSE Media Roundel.png"],
  [/religio/i, "OSE Religion Roundel.png"],
];
export const roundelSrc = (subject: string, demo = false) => demo ? "/osedtech/demo-roundel.svg" : "/roundels/" + encodeURIComponent((ROUNDEL.find(([re]) => re.test(subject)) || [, "OSE Roundel.png"])[1]!);

export function CourseCard({ c, mark = "OH–SO" }: { c: Course; mark?: string }) {
  const lessons = `${c.lessons_per_week} lesson${c.lessons_per_week > 1 ? "s" : ""} per week`;
  return (
    <article className={`course${c.is_full ? " is-full" : ""}`}>
      <div className="top">
        <div><div className="lvl">{c.level}</div><h3>{c.subject}</h3></div>
        <div className="roundel" style={{ ["--c" as string]: c.colour }} aria-hidden="true">
          <span>{mark}<br />{c.subject.split(" ")[0]}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {mark === "OH–SO" && <img src={roundelSrc(c.subject)} alt="" width={86} height={86} />}
        </div>
      </div>
      <ul className="facts">
        <li>{c.course_years} year Course</li>
        <li>{lessons}</li>
      </ul>
      {c.is_full
        ? <p className="when wl">This group is full. Join the waiting list and we’ll email you if a place comes up or a new group opens.</p>
        : c.status === "waitlist" ? <p className="when wl">Days and times announced when the course opens</p>
        : c.slots?.length ? <ul className="slots">{c.slots.map((s, i) => <li key={i}>{DAYS[s.d]} – {s.t}</li>)}</ul> : null}
      {c.is_next && <p className="starts">Starts {monthYear(c.year_start)}</p>}
      <p className="price">{money(c.course_total_pence)}</p>
      <div className="cbtns">
        {c.label && <span className={`sticky sl-${LABEL_CLASS[c.label] || "few"}`}>{c.label_text ?? c.label}</span>}
        <Link className="btn sm btn-brand cread" href={`/courses/${c.page_slug}`}>Read more</Link>
        <span className={`btn sm ${c.shows_waitlist ? "btn-line" : "btn-line"}`} aria-disabled="true" title="Booking opens in the next update">
          {c.shows_waitlist ? "Join waiting list" : "Add to cart"}
        </span>
      </div>
    </article>
  );
}
