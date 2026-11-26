import { AddToCart } from "./AddToCart";
import Link from "@/app/(site)/HoverLink";
import type { Course } from "@/lib/data";
import { money, DAYS, monthYear } from "@/lib/format";

const LABEL_CLASS: Record<string, string> = { "Few spaces left": "few", "Almost full": "almost", "New Group!": "new", "New Group Launching Soon!": "soon" };
/** The sticker on a course: "No spaces left" (orange) for a full group (20 Nov), else its label ("Few spaces left"…). */
export const stickerOf = (g: { is_full?: boolean; label?: string | null; label_text?: string | null; trial?: boolean } | null | undefined): { text: string; cls: string } | null =>
  !g ? null : g.trial ? { text: "Try it free", cls: "sl-new" } : g.is_full ? { text: "No spaces left", cls: "sl-full" } : g.label ? { text: g.label_text ?? g.label, cls: `sl-${LABEL_CLASS[g.label] || "few"}` } : null;

// The subject roundels (files in public/roundels, from the OSE "Roundels" Drive folder; 500px versions from 20 Nov, plus Computing).
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
  [/computing|computer|\bict\b/i, "OSE Computing Roundel.png"],
];
export const roundelSrc = (subject: string, demo = false) => demo ? "/osedtech/demo-roundel.svg" : "/roundels/" + encodeURIComponent((ROUNDEL.find(([re]) => re.test(subject)) || [, "OSE Roundel.png"])[1]!) + "?v=2";   // ?v=2: the 20 Nov files have the same names

/** Each subject's roundel colour and word (from the image files): used for colours, and as text where there's no image. */
const FACE: [RegExp, string, string][] = [
  [/english/i, "#008cdb", "English"], [/french|spanish|german|italian|latin|language/i, "#a7dd63", "Languages"], [/math/i, "#14af7c", "Maths"],
  [/science|biology|chemistry|physics/i, "#cdc100", "Science"], [/geography/i, "#ff914d", "Geography"], [/history/i, "#804ac2", "History"],
  [/business/i, "#9fb4cd", "Business"], [/economics/i, "#506fa6", "Economics"], [/media/i, "#cf65a6", "Media"], [/religio/i, "#cf65a6", "Religion"],
  [/computing|computer|\bict\b/i, "#0cc0df", "Computing"],
];
export const roundelFace = (subject: string) => { const f = FACE.find(([re]) => re.test(subject)); return f ? { bg: f[1], word: f[2] } : { bg: "#000c4a", word: "Ed" }; };
/** The subject's roundel colour (so Biology and Chemistry hover in the Science yellow), or the course's own colour for subjects without a roundel. */
/** A subject's roundel as an image, at any size (the 500px files stay sharp on the course page). */
export function Roundel({ subject, className, size }: { subject: string; className?: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`cd-rtext cd-rimg${className ? " " + className : ""}`} src={roundelSrc(subject)} alt="" width={size} height={size} aria-hidden="true" />;
}
/** (23 Nov) The subject's own colour, set in Settings → Subject colours (the brand sheet's), else its roundel's. */
export const subjectColour = (subject: string, colour: string) => colour || (FACE.find(([re]) => re.test(subject))?.[1] ?? "#8494c2");

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
        : c.trial ? <p className="when wl">A new course: it starts once {c.needed ?? 5} families sign up. Try a lesson free first.</p>
        : c.status === "waitlist" ? <p className="when wl">Days and times announced when the course opens</p>
        : c.slots?.length ? <ul className="slots">{c.slots.map((s, i) => <li key={i}>{DAYS[s.d]} – {s.t}</li>)}</ul> : null}
      {c.is_next && <p className="starts">Starts {monthYear(c.year_start)}</p>}
      <p className="price">{money(c.course_total_pence)}</p>
      <div className="cbtns">
        {stickerOf(c) && <span className={`sticky ${stickerOf(c)!.cls}`}>{stickerOf(c)!.text}</span>}
        <Link className="btn sm btn-line cread" href={`/courses/${c.page_slug}`}>Read more</Link>
        {c.trial ? <Link className="btn sm btn-line" href={`/taster?level=${encodeURIComponent(c.level)}&subject=${encodeURIComponent(c.subject)}`}>Book a free taster</Link>
          : c.shows_waitlist || !c.bookable || mark !== "OH–SO" ? <span className="btn sm btn-line" aria-disabled="true" title="Booking opens in the next update">
          {c.shows_waitlist ? "Join waiting list" : c.is_full ? "Full" : "Add to cart"}
        </span> : <AddToCart code={c.code} label={`${c.level} ${c.subject}`} />}
      </div>
    </article>
  );
}
