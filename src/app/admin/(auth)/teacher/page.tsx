import { requireSignedIn } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { signOutAction } from "../../actions";

export const dynamic = "force-dynamic";

// Teachers' area: their classes for now. Registers, reports and messages come with the teacher dashboard.
export default async function TeacherHome() {
  const me = await requireSignedIn();
  const classes = await withSchool((q) => q<{ code: string; name: string; slots: string | null; students: number }>(`
    select g.code, l.name || ' ' || sj.name as name,
      (select string_agg(case s.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end || ' ' || to_char(s.starts_at,'HH24:MI'), ', ' order by s.weekday) from lesson_slots s where s.group_id = g.id) as slots,
      (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active')) as students
    from course_groups g join teachers t on t.id = g.teacher_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    join academic_years y on y.id = g.academic_year_id where t.user_id = $1 and y.ends_on >= current_date order by l.sort_order, sj.name`, [me.id]));
  return <>
    <h1>Hello, {me.name.split(" ")[0]}</h1>
    <p>Your teacher dashboard is being built. Here are your classes for now.</p>
    {classes.length === 0 ? <p className="ok">No classes are assigned to you yet.</p> :
      <div style={{ display: "grid", gap: 8 }}>{classes.map((c) => <div key={c.code} style={{ border: "1px solid #dfe2ea", borderRadius: 10, padding: "10px 12px" }}>
        <b>{c.name}</b> <span style={{ color: "#5c6378" }}>({c.code})</span><br /><span style={{ color: "#5c6378", fontSize: 14 }}>{c.slots ?? "Times to be set"} · {c.students} student{c.students === 1 ? "" : "s"}</span></div>)}</div>}
    {me.role === "school_admin" && <p><a href="/admin">Go to the admin</a></p>}
    <form action={signOutAction}><button type="submit">Sign out</button></form>
  </>;
}
