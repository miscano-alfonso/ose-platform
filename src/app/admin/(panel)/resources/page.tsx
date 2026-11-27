import { getResources, groupBySubject, officeSuggestions, RES_KINDS, ALL_SUBJECTS, SUGG_STATUS, type Resource, type Suggestion } from "@/lib/resources";
import { withSchool } from "@/lib/db";
import { saveResourceAction, deleteResourceAction, addSuggestionAction, notNowSuggestionAction } from "../../actions";

export const dynamic = "force-dynamic";

// Admin → Website → Resources (21 Nov): the website's public Resources page: useful resources for each subject
// (websites, things to watch or listen to, books, tips), suggested by the teachers for learning at home.
export default async function ResourcesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, list, sugg, subjects] = await Promise.all([searchParams, getResources(true), officeSuggestions(),
    withSchool((q) => q<{ name: string }>(`select distinct name from subjects order by name`)).catch(() => [] as { name: string }[])]);
  const groups = groupBySubject(list);
  const waiting = sugg.filter((x) => x.status === "new"), decided = sugg.filter((x) => x.status !== "new");
  // the subjects to offer when adding: the school's subjects, plus any already used here, plus "All subjects"
  const options = [...new Set([...subjects.map((s) => s.name), ...list.map((r) => r.subject)])].filter((s) => s !== ALL_SUBJECTS).sort();
  return <>
    <div className="top"><div><h1>Resources</h1><div className="sub">Useful resources for learning at home, grouped by subject, on the website’s Resources page (in the website menu). Ask teachers for their favourites: documentaries, websites, podcasts and textbooks.</div></div>
      <span className="grow" /><a className="abtn sm" href="/resources" target="_blank" rel="noreferrer">View the page</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <p className="note">Each subject has its own address to share with a parent, e.g. <b>/resources#geography</b>. Choose <b>Tip</b> for advice with no link (“Watch any documentary about the world”). <b>{ALL_SUBJECTS}</b> always shows last.</p>
    <datalist id="res-subjects">{[...options, ALL_SUBJECTS].map((s) => <option key={s} value={s} />)}</datalist>
    {/* 27 Nov: teachers suggest resources from their own Resources page */}
    {sugg.length > 0 && <section className="card" id="suggested"><h2>Suggested by teachers {waiting.length > 0 && <span className="pill info">{waiting.length} new</span>}</h2>
      {waiting.length === 0 ? <p className="note">Nothing new. Teachers suggest resources from <b>Resources</b> in their menu.</p>
        : <><p className="note">Check the link and wording, change anything you like, then <b>Add to the page</b>. Or choose <b>Not for now</b> (with a note if you like): the teacher sees either on their Resources page.</p>
          <div className="gd-list">{waiting.map((x) => <SuggestionForm key={x.id} x={x} />)}</div></>}
      {decided.length > 0 && <details className="gd-add"><summary className="abtn sm">Decided in the last 30 days · {decided.length}</summary>
        <ul className="rs-slist">{decided.map((x) => { const [label, tone] = SUGG_STATUS[x.status]; return <li key={x.id}><div><b>{x.title}</b><span className="muted">{x.subject} · from {x.teacher}{x.office_note ? ` · “${x.office_note}”` : ""}</span></div><span className={`pill ${tone}`}>{label}</span></li>; })}</ul></details>}
    </section>}
    <section className="card"><h2>Add a resource</h2><ResourceForm /></section>
    {groups.map(([subject, items]) => <section key={subject} className="card"><h2>{subject} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· {items.length}</span></h2>
      <div className="gd-list">{items.map((r) => <ResourceForm key={r.id} r={r} />)}</div>
      <details className="gd-add"><summary className="abtn sm">Add one for {subject}</summary><ResourceForm subject={subject} /></details>
    </section>)}
    {groups.length === 0 && <p className="empty">Nothing yet. The page says resources are coming soon.</p>}
  </>;
}

function ResourceForm({ r, subject }: { r?: Resource; subject?: string }) {
  return <form action={saveResourceAction} className={`gd-row${r?.hidden ? " is-hidden" : ""}`}>
    {r && <input type="hidden" name="id" value={r.id} />}
    <div className="gd-fields">
      <label className="fld">Title<input name="title" required maxLength={120} defaultValue={r?.title} /></label>
      <label className="fld">Kind<select name="kind" defaultValue={r?.kind ?? "website"}>{RES_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
      <label className="fld">Subject<input name="subject" required maxLength={60} list="res-subjects" defaultValue={r?.subject ?? subject} placeholder="e.g. Geography" /></label>
      <label className="fld">Order<input name="sort" type="number" min={0} max={99} defaultValue={r?.sort_order ?? 0} /></label>
      <label className="fld gd-wide">Link (https://…, leave empty for a tip)<input name="url" type="url" maxLength={600} defaultValue={r?.url ?? ""} placeholder="https://…" /></label>
      <label className="fld gd-wide">Short description<input name="description" maxLength={400} defaultValue={r?.description ?? ""} /></label>
    </div>
    <div className="gd-acts">
      {r && <label className="chk"><input type="checkbox" name="hidden" defaultChecked={r.hidden} /> Hide from the page</label>}
      <button className="abtn pri sm" type="submit">{r ? "Save" : "Add"}</button>
      {r?.url && <a className="abtn sm" href={r.url} target="_blank" rel="noopener">Open</a>}
      {r && <button className="abtn sm" type="submit" formAction={deleteResourceAction} formNoValidate>Remove</button>}
    </div>
  </form>;
}

function SuggestionForm({ x }: { x: Suggestion }) {
  return <form action={addSuggestionAction} className="gd-row">
    <input type="hidden" name="id" value={x.id} />
    <p className="rs-from">From <b>{x.teacher}</b> on {new Date(x.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</p>
    <div className="gd-fields">
      <label className="fld">Title<input name="title" required maxLength={120} defaultValue={x.title} /></label>
      <label className="fld">Kind<select name="kind" defaultValue={x.kind}>{RES_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
      <label className="fld">Subject<input name="subject" required maxLength={60} list="res-subjects" defaultValue={x.subject} /></label>
      <label className="fld">Order<input name="sort" type="number" min={0} max={99} defaultValue={0} /></label>
      <label className="fld gd-wide">Link<input name="url" type="url" maxLength={600} defaultValue={x.url ?? ""} placeholder="https://…" /></label>
      <label className="fld gd-wide">Short description<input name="description" maxLength={400} defaultValue={x.description ?? ""} /></label>
      <label className="fld gd-wide">Note to the teacher (optional)<input name="note" maxLength={500} placeholder="e.g. Thanks, great find" /></label>
    </div>
    <div className="gd-acts">
      <button className="abtn pri sm" type="submit">Add to the page</button>
      {x.url && <a className="abtn sm" href={x.url} target="_blank" rel="noopener">Open the link</a>}
      <button className="abtn sm" type="submit" formAction={notNowSuggestionAction} formNoValidate>Not for now</button>
    </div>
  </form>;
}
