import Link from "@/app/(site)/HoverLink";
import type { Metadata } from "next";
import { getCourses } from "@/lib/data";
import { yearLabel, monthYear } from "@/lib/format";
import { CourseCard } from "../CourseCard";
import { siteInfo } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Courses", description: "KS3, pre-GCSE and GCSE courses: days, times, prices and places." };

export default async function Courses({ searchParams }: { searchParams: Promise<{ year?: string; level?: string }> }) {
  const sp = await searchParams;
  const [all, site] = await Promise.all([getCourses(), siteInfo()]);
  const years = [...new Map(all.map((c) => [c.year_label, c])).values()];
  const yr = years.find((y) => y.year_label === sp.year) ?? years[years.length - 1];
  const inYear = all.filter((c) => c.year_label === yr?.year_label);
  const levels = [...new Set(inYear.map((c) => c.level))];
  const lv = levels.includes(sp.level || "") ? sp.level! : levels[0];
  const list = inYear.filter((c) => c.level === lv);
  const href = (y: string, l?: string) => `/courses?year=${encodeURIComponent(y)}${l ? `&level=${encodeURIComponent(l)}` : ""}`;
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Courses</h1><p>Choose a level to see subjects, lesson times and prices.</p></div></section>
    <div className="ph-sticky"><nav className="tabs ph-tabs" aria-label="Level">{levels.map((l) =>
        <Link key={l} href={href(yr.year_label, l)} className={l === lv ? "on" : ""} aria-current={l === lv ? "page" : undefined}>{l}</Link>)}</nav></div>
    <section className="s-sec"><div className="wrap">
      {years.length > 1 && <nav className="yrtabs" aria-label="School year">{years.map((y) =>
        <Link key={y.year_label} href={href(y.year_label)} className={y.year_label === yr.year_label ? "on" : ""} aria-current={y.year_label === yr.year_label ? "page" : undefined}>
          <b>{yearLabel(y.year_label)}</b><span>{y.is_next ? `Starts ${monthYear(y.year_start)}` : "This year · join now"}</span></Link>)}</nav>}
      <div className="cgrid">{list.map((c) => <CourseCard key={c.code} c={c} mark={site.demo ? "DEMO" : undefined} />)}</div>
      {!list.length && <p>No courses to show yet.</p>}
    </div></section>
  </>);
}
