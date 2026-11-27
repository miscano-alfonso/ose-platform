import { requireViewer } from "@/lib/auth";
import { teacherSubjects, mySuggestions, RES_KINDS, SUGG_STATUS } from "@/lib/resources";
import { withSchool } from "@/lib/db";
import { ResourcesView } from "@/app/(family)/ResourcesView";
import { suggestResourceAction, withdrawSuggestionAction } from "../../../actions";
import { dm } from "../fmt";

export const dynamic = "force-dynamic";

// Teacher → Resources (27 Nov, Alfonso: "add a Resources item to their nav, so they can see resources, and suggest
// resources to admin for their subjects"). The same Resources the families see, the teacher's subjects first, with a
// "Suggest a resource" form; the office adds suggestions from Admin → Website → Resources.
export default async function TeacherResources({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const [mine, sugg, all] = await Promise.all([teacherSubjects(me.id), mySuggestions(me.id),
    withSchool((q) => q<{ name: string }>(`select distinct name from subjects order by name`)).catch(() => [] as { name: string }[])]);
  const courses = mine.map((s) => ({ subject: s, level: "" }));
  const others = all.map((s) => s.name).filter((s) => !mine.includes(s));
  const open = !!sp.err || sugg.length === 0;
  return <ResourcesView base="/admin/teacher/resources" tab={sp.tab} courses={courses} forParent={false} teacher>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <section className="card rs-suggest" id="suggest">
      <details open={open}><summary><h2>Suggest a resource</h2><span className="abtn sm pri" aria-hidden="true">Suggest one</span></summary>
        <p className="note">A website, something to watch or listen to, a book, or a tip with no link (“Watch any documentary about the world”). The office checks it and adds it to the Resources page for parents and students.</p>
        <form action={suggestResourceAction} className="gd-row">
          <div className="gd-fields">
            <label className="fld">Subject<select name="subject" required defaultValue={mine[0] ?? ""}>
              {mine.length > 0 && <optgroup label="Your subjects">{mine.map((s) => <option key={s}>{s}</option>)}</optgroup>}
              <optgroup label={mine.length ? "Other subjects" : "Subjects"}>{others.map((s) => <option key={s}>{s}</option>)}<option>All subjects</option></optgroup></select></label>
            <label className="fld">Kind<select name="kind" defaultValue="website">{RES_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
            <label className="fld gd-wide">Title<input name="title" required maxLength={120} placeholder="e.g. Simon Reeve on BBC iPlayer" /></label>
            <label className="fld gd-wide">Link (https://…, leave empty for a tip)<input name="url" type="url" maxLength={600} placeholder="https://…" /></label>
            <label className="fld gd-wide">Why it’s useful (one or two sentences)<input name="description" maxLength={400} /></label>
          </div>
          <div className="gd-acts"><button className="abtn pri sm" type="submit">Send to the office</button></div>
        </form>
      </details>
      {sugg.length > 0 && <><h3 className="rs-sh">Your suggestions</h3>
        <ul className="rs-slist">{sugg.map((s) => { const [label, tone] = SUGG_STATUS[s.status] ?? SUGG_STATUS.new;
          return <li key={s.id}><div><b>{s.url ? <a href={s.url} target="_blank" rel="noopener">{s.title}</a> : s.title}</b>
            <span className="muted">{s.subject} · {RES_KINDS.find((k) => k.id === s.kind)?.label} · sent {dm(s.created_at)}</span>
            {s.office_note && <span className="rs-snote">Office: {s.office_note}</span>}</div>
            <span className={`pill ${tone}`}>{label}</span>
            {s.status === "new" && <form action={withdrawSuggestionAction}><input type="hidden" name="id" value={s.id} /><button className="abtn sm" type="submit">Withdraw</button></form>}</li>; })}</ul></>}
    </section>
  </ResourcesView>;
}
