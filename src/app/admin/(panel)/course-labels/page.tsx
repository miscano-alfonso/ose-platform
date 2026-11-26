import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { LABEL_KEYS, labelWords } from "@/lib/course-labels";
import { courseLabelsAction, shortNamesAction } from "./actions";
import { withSchool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Settings → Course labels: the wording of the stickers on course cards ("Few spaces left", "Launching Soon!"…).
export default async function CourseLabels({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp] = await Promise.all([searchParams, requireStaff()]);
  const w = await labelWords();
  const subjects = await withSchool((q) => q<{ id: string; name: string; short_name: string | null; used: boolean }>(`select s.id, s.name, s.short_name,
    exists (select 1 from course_groups g where g.subject_id = s.id) as used from subjects s order by s.name`)).catch(() => []);
  return <>
    <div className="top"><div><h1>Course labels</h1><div className="sub">The stickers on course cards on the website, and short subject names for the dashboards. Change the wording here; which label each class shows is set in <Link href="/admin/classes">Classes</Link> (Website label), or chosen automatically.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <form action={courseLabelsAction} className="card" style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      {LABEL_KEYS.map((k) => <label className="fld" key={k.key}>{k.hint}
        <input name={k.key} defaultValue={w[k.key]} maxLength={40} required /></label>)}
      <div><button className="abtn pri" type="submit">Save</button></div>
    </form>
    {/* 26 Nov (Alfonso): short names for subjects, used on the dashboards */}
    <h2 id="short" style={{ marginTop: 28 }}>Short subject names</h2>
    <p className="muted" style={{ maxWidth: 720 }}>Used on the teacher, parent and student dashboards, so class names and the student menu read simpler (e.g. “KS3 English” instead of “KS3 English Language”). The website, reports and emails keep the full name. Leave a box empty to use the full name.</p>
    <form action={shortNamesAction} className="card" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
      {subjects.filter((s) => s.used || s.short_name).map((s) => <label key={s.id} className="fld" style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(160px, 1fr)", alignItems: "center", gap: 12 }}>
        <span>{s.name}</span><input type="hidden" name="sid" value={s.id} />
        <input name={`short_${s.id}`} defaultValue={s.short_name ?? ""} placeholder={s.name} maxLength={40} aria-label={`Short name for ${s.name}`} /></label>)}
      <div><button className="abtn pri" type="submit">Save short names</button></div>
    </form>
  </>;
}
