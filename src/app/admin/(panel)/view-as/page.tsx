import { withSchool } from "@/lib/db";
import LiveSearch from "../../LiveSearch";
import { viewAsFamilyAction } from "../../actions";

export const dynamic = "force-dynamic";

// "Viewing as" a parent or a student: pick who, then see their dashboard exactly as they do (read-only).
export default async function ViewAs({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "s" ? "s" : "p", q = (sp.q ?? "").trim().toLowerCase();
  const rows = await withSchool((x) => kind === "p"
    ? x<{ id: string; name: string; detail: string }>(`select p.id, p.first_name || ' ' || p.last_name as name, p.email::text || ' · ' || coalesce((select string_agg(s.first_name, ', ' order by s.first_name) from students s where s.parent_id = p.id), '') as detail
        from parents p order by p.last_name, p.first_name`)
    : x<{ id: string; name: string; detail: string }>(`select s.id, s.first_name || ' ' || s.last_name as name, coalesce(s.email::text, 'no Google account') || ' · ' || coalesce((select string_agg(distinct l.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id where e.student_id = s.id and e.status = 'active'), '') as detail
        from students s where exists (select 1 from enrolments e where e.student_id = s.id and e.status = 'active') order by s.first_name, s.last_name`));
  const list = rows.filter((r) => !q || `${r.name} ${r.detail}`.toLowerCase().includes(q)).slice(0, 60);
  return <>
    <div className="top"><div><h1>View as a {kind === "p" ? "parent" : "student"}</h1><div className="sub">See their dashboard exactly as they do. Nothing can be changed or sent while you’re viewing, and the view is recorded.</div></div></div>
    <div style={{ marginBottom: 12 }}><LiveSearch placeholder={kind === "p" ? "Parent, child or email" : "Student or email"} /></div>
    <section className="card">{list.length === 0 ? <p className="empty">{rows.length ? "Nobody matches." : kind === "p" ? "No families yet." : "No enrolled students yet."}</p> : list.map((r) => <form key={r.id} action={viewAsFamilyAction} className="li">
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={r.id} /><div className="t"><b>{r.name}</b><span>{r.detail}</span></div><button className="abtn sm" type="submit">View</button></form>)}</section>
  </>;
}
