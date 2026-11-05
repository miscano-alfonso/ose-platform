import Link from "next/link";

// 5 Nov: Students and Attendance are one section. Overview is /admin/students; the attendance tabs stay at /admin/attendance?tab=….
const TABS: [string, string, string][] = [["overview", "Overview", "/admin/students"], ["students", "Attendance", "/admin/attendance?tab=students"],
  ["lessons", "Lesson by lesson", "/admin/attendance?tab=lessons"], ["absences", "Reported absences", "/admin/attendance?tab=absences"],
  ["joins", "Check Meet joins", "/admin/attendance?tab=joins"], ["access", "Lesson access", "/admin/students/access"], ["google", "Google Meet & Classroom", "/admin/attendance?tab=google"]];
export function StudentsTabs({ current, counts = {}, href }: { current: string; counts?: Record<string, number>; href?: (tab: string) => string }) {
  return <div className="segl st-tabs" role="tablist" aria-label="Students" style={{ marginBottom: 14 }}>{TABS.map(([k, l, h]) =>
    <Link key={k} href={href && k !== "overview" && k !== "access" ? href(k) : h} aria-current={current === k ? "true" : undefined}>{l}{counts[k] ? ` (${counts[k]})` : ""}</Link>)}</div>;
}
