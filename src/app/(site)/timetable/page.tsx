import type { Metadata } from "next";
import { getCourses } from "@/lib/data";
import { WeekCalendar, type Lesson } from "./WeekCalendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Timetable", description: "Weekly lesson times for every course. All times are UK time; each lesson is 45 minutes." };

export default async function Timetable({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const sp = await searchParams;
  const all = (await getCourses()).filter((c) => !c.is_next);
  const levels = [...new Set(all.map((c) => c.level))];
  const lessons: Lesson[] = all.filter((c) => c.shows_times).flatMap((c) => (c.slots || []).map((s) => ({ d: s.d, t: s.t, mins: 45, subject: c.subject, level: c.level,
    colour: c.colour, href: `/courses/${c.page_slug}`, teacher: c.teacher })));
  const soon = all.filter((c) => !c.shows_times);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Timetable</h1><p>Live lessons each week, for every level. All times are UK time; each lesson is 45 minutes.</p></div></section>
    <section className="s-sec"><div className="wrap">
      <WeekCalendar lessons={lessons} levels={levels} initial={levels.includes(sp.level || "") ? sp.level! : null} />
      {soon.length > 0 && <p className="ttnote">Times to be announced (waiting list or launching soon): {soon.map((c) => `${c.level} ${c.subject}`).join(", ")}.</p>}
    </div></section>
  </>);
}
