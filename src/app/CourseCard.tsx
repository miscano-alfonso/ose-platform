import type { Course } from "@/lib/data";
import { money, SHORT, monthYear } from "@/lib/format";

const LABEL_CLASS: Record<string, string> = { "Few spaces left": "few", "Almost full": "almost", "New Group!": "new", "New Group Launching Soon!": "soon" };

export function CourseCard({ c }: { c: Course }) {
  const per = `${c.lessons_per_week} lesson${c.lessons_per_week > 1 ? "s" : ""} a week`;
  const when = c.is_full
    ? "This group is full. Join the waiting list and we’ll email you if a place comes up or a new group opens."
    : c.status === "waitlist" ? "Days and times announced when the course opens"
    : c.slots?.length ? `${c.slots.map((s) => `${SHORT[s.d]} ${s.t}`).join(" and ")} · ${per}` : per;
  return (
    <article className={`course${c.is_full ? " is-full" : ""}`}>
      {c.label && <span className={`sticky sl-${LABEL_CLASS[c.label] || "few"}`}>{c.label}</span>}
      <div className="top">
        <div className="roundel" style={{ ["--c" as string]: c.colour }} aria-hidden="true">OH–SO<br />{c.subject}</div>
        <div><div className="lvl">{c.level}</div><h3>{c.subject}</h3></div>
      </div>
      <p className="when">{when}</p>
      {c.is_next && <p className="starts">Starts {monthYear(c.year_start)}</p>}
      <p className="price">{money(c.total_pence)} <small>{c.course_years > 1 ? "for year 1" : "a year"}</small></p>
      {c.shows_waitlist && <p className="wltag">Waiting list</p>}
      <div className="cbtns">
        <span className={`btn sm ${c.shows_waitlist ? "btn-line" : "btn-brand"}`} aria-disabled="true" title="Booking opens in the next update">
          {c.shows_waitlist ? "Join waiting list" : "Add to cart"}
        </span>
      </div>
    </article>
  );
}
