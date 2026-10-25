import Link from "next/link";
import { requireSignedIn } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { teacherReportClasses } from "@/lib/reports";
import { listThreads } from "@/lib/community";

export const dynamic = "force-dynamic";

// The teacher's dashboard: registers to take, this week's lessons and their classes.
export default async function TeacherHome() {
  const me = await requireSignedIn();
  const [classes, lessons] = await withSchool(async (q) => [
    await q<{ code: string; name: string; slots: string | null; students: number }>(`
      select g.code, l.name || ' ' || sj.name as name,
        (select string_agg(case s.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end || ' ' || to_char(s.starts_at,'HH24:MI'), ', ' order by s.weekday) from lesson_slots s where s.group_id = g.id) as slots,
        (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students
      from course_groups g join teachers t on t.id = g.teacher_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      join academic_years y on y.id = g.academic_year_id where t.user_id = $1 and y.ends_on >= current_date order by l.sort_order, sj.name`, [me.id]),
    await q<{ id: string; d: string; time: string; name: string; code: string; status: string }>(`
      select e.id, e.lesson_date::text as d, to_char(s.starts_at,'HH24:MI') as time, l.name || ' ' || sj.name as name, g.code, e.status::text
      from lesson_events e join teachers t on t.id = e.teacher_id join lesson_slots s on s.id = e.slot_id join course_groups g on g.id = e.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where t.user_id = $1 and e.status <> 'cancelled' and ((e.lesson_date <= current_date and e.status = 'scheduled' and e.lesson_date > current_date - 60)
        or e.lesson_date between current_date and current_date + 7)
      order by e.lesson_date, s.starts_at`, [me.id]),
  ]);
  const [reports, threads] = await Promise.all([teacherReportClasses(me.id), listThreads(me.id, "open")]);
  const today = new Date().toISOString().slice(0, 10);
  const todo = lessons.filter((l) => l.d <= today && l.status === "scheduled"), soon = lessons.filter((l) => l.d > today || (l.d === today && l.status !== "scheduled"));
  const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return <>
    <div className="top"><div><h1>Hello, {me.name.split(" ")[0]}</h1><div className="sub">Your lessons and registers</div></div>
      <span className="grow" /><Link className="abtn sm" href="/admin/points">Give reward points</Link><Link className="abtn sm" href="/admin/messages/new">Write to a family</Link>
      {me.role === "school_admin" && <Link className="abtn sm" href="/admin">Go to the admin</Link>}</div>
    <section className="card"><h2>Registers to take</h2>
      {todo.length === 0 ? <p className="empty">All registers are up to date.</p> : todo.map((l) => <div className="li" key={l.id}>
        <div className="t"><b>{l.name} <span className="muted" style={{ fontWeight: 400 }}>{l.code}</span></b><span>{day(l.d)} · {l.time}</span></div>
        <Link className="abtn pri sm" href={`/admin/register/${l.id}`}>Take register</Link></div>)}</section>
    {reports.length > 0 && <section className="card"><h2>Reports to write</h2>
      {reports.map((r) => <div className="li" key={r.cycle_id + r.group_id}>
        <div className="t"><b>{r.name} <span className="muted" style={{ fontWeight: 400 }}>{r.code}</span></b><span>{r.cycle} · {r.done}/{r.total} done · due {day(r.comments_due)}</span></div>
        <Link className={`abtn sm${r.done < r.total ? " pri" : ""}`} href={`/admin/write/${r.cycle_id}/${r.group_id}`}>{r.done < r.total ? "Write" : "View"}</Link></div>)}</section>}
    {threads.length > 0 && <section className="card"><h2>Messages</h2>
      {threads.map((t) => <div className="li" key={t.id}><div className="t"><b>{t.subject}</b><span>{t.parent} · about {t.student}{t.last_sender === "parent" ? " · waiting for your reply" : ""}</span></div>
        <Link className={`abtn sm${t.last_sender === "parent" ? " pri" : ""}`} href={`/admin/messages/${t.id}`}>Open</Link></div>)}</section>}
    <section className="card"><h2>Coming up this week</h2>
      {soon.length === 0 ? <p className="empty">No lessons in the next 7 days.</p> : soon.map((l) => <div className="li" key={l.id}>
        <div className="t"><b>{l.name} <span className="muted" style={{ fontWeight: 400 }}>{l.code}</span></b><span>{day(l.d)} · {l.time}</span></div>
        <Link className="abtn sm" href={`/admin/register/${l.id}`}>Open</Link></div>)}</section>
    <section className="card"><h2>Your classes</h2>
      {classes.length === 0 ? <p className="empty">No classes are assigned to you yet.</p> : classes.map((c) => <div className="li" key={c.code}>
        <div className="t"><b>{c.name} <span className="muted" style={{ fontWeight: 400 }}>{c.code}</span></b><span>{c.slots ?? "Times to be set"} · {c.students} student{c.students === 1 ? "" : "s"}</span></div></div>)}</section>
  </>;
}
