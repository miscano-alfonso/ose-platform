import { AddToCart } from "./AddToCart";
import Link from "@/app/(site)/HoverLink";
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

/** The same roundel drawn as text in the site font, for large sizes where the 240px image would look soft (colours from the image files). */
const FACE: [RegExp, string, string][] = [
  [/english/i, "#008cdb", "English"], [/french|spanish|german|italian|latin|language/i, "#a7dd63", "Languages"], [/math/i, "#14af7c", "Maths"],
  [/science|biology|chemistry|physics/i, "#cdc100", "Science"], [/geography/i, "#ff914d", "Geography"], [/history/i, "#804ac2", "History"],
  [/business/i, "#9fb4cd", "Business"], [/economics/i, "#506fa6", "Economics"], [/media/i, "#cf65a6", "Media"], [/religio/i, "#cf65a6", "Religion"],
];
export const roundelFace = (subject: string) => { const f = FACE.find(([re]) => re.test(subject)); return f ? { bg: f[1], word: f[2] } : { bg: "#000c4a", word: "Ed" }; };
/** The subject's roundel colour (so Biology and Chemistry hover in the Science yellow), or the course's own colour for subjects without a roundel. */
export const subjectColour = (subject: string, fallback: string) => FACE.find(([re]) => re.test(subject))?.[1] ?? fallback;

export function CourseCard({ c, mark = "OH–SO" }: { c: Course; mark?: string }) {
  const lessons = `${c.lessons_per_week} lesson${c.lessons_per_week > 1 ? "s" : ""} per week`;
  return (
    <article className={`course${c.is_full ? " is-full" : ""}`} style={{ ["--c" as string]: mark === "OH–SO" ? subjectColour(c.subject, c.colour) : c.colour }}>
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
        <Link className="btn sm btn-line cread" href={`/courses/${c.page_slug}`}>Read more</Link>
        {c.shows_waitlist || !c.bookable || mark !== "OH–SO" ? <span className="btn sm btn-line" aria-disabled="true" title="Booking opens in the next update">
          {c.shows_waitlist ? "Join waiting list" : c.is_full ? "Full" : "Add to cart"}
        </span> : <AddToCart code={c.code} label={`${c.level} ${c.subject}`} />}
      </div>
    </article>
  );
}
