import { getGuides, AUDIENCES, KINDS, type Guide } from "@/lib/guides";
import { saveGuideAction, deleteGuideAction } from "../../actions";

export const dynamic = "force-dynamic";

// Admin → Website → Guides (2 Nov): the links on the website's /guides page, for teachers, parents and students.
export default async function GuidesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, guides] = await Promise.all([searchParams, getGuides(true)]);
  return <>
    <div className="top"><div><h1>Guides</h1><div className="sub">Presentations and how-to guides for teachers, parents and students, on the website’s Guides page. Anyone with the link can open the page; it isn’t in the website’s menu.</div></div>
      <span className="grow" /><a className="abtn sm" href="/guides" target="_blank" rel="noreferrer">View the page</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <p className="note">Share the page as <b>{"/guides"}</b>, or one part of it: <b>/guides#teachers</b>, <b>/guides#parents</b>, <b>/guides#students</b>. Check each link opens for someone who isn’t signed in (a Claude presentation needs sharing as “anyone with the link”; a Google file as “anyone with the link can view”).</p>
    {AUDIENCES.map((a) => { const list = guides.filter((g) => g.audience === a.id);
      return <section key={a.id} className="card"><h2>{a.label} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· {list.length}</span></h2>
        {list.length === 0 && <p className="empty" style={{ textAlign: "left" }}>Nothing yet. The page shows “Coming soon”.</p>}
        <div className="gd-list">{list.map((g) => <GuideForm key={g.id} g={g} audience={a.id} />)}</div>
        <details className="gd-add"><summary className="abtn sm">Add one for {a.label.toLowerCase()}</summary><GuideForm audience={a.id} /></details>
      </section>; })}
  </>;
}

function GuideForm({ g, audience }: { g?: Guide; audience: string }) {
  return <form action={saveGuideAction} className={`gd-row${g?.hidden ? " is-hidden" : ""}`}>
    {g && <input type="hidden" name="id" value={g.id} />}
    <div className="gd-fields">
      <label className="fld">Title<input name="title" required maxLength={120} defaultValue={g?.title} /></label>
      <label className="fld">Kind<select name="kind" defaultValue={g?.kind ?? "slides"}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
      <label className="fld">For<select name="audience" defaultValue={g?.audience ?? audience}>{AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      <label className="fld">Order<input name="sort" type="number" min={0} max={99} defaultValue={g?.sort_order ?? 0} /></label>
      <label className="fld gd-wide">Link (https://…)<input name="url" type="url" required maxLength={600} defaultValue={g?.url} placeholder="https://claude.ai/artifact/… or https://docs.google.com/…" /></label>
      <label className="fld gd-wide">Short description<input name="description" maxLength={400} defaultValue={g?.description ?? ""} /></label>
    </div>
    <div className="gd-acts">
      {g && <label className="chk"><input type="checkbox" name="hidden" defaultChecked={g.hidden} /> Hide from the page</label>}
      <button className="abtn pri sm" type="submit">{g ? "Save" : "Add"}</button>
      {g && <a className="abtn sm" href={g.url} target="_blank" rel="noopener">Open</a>}
      {g && <button className="abtn sm" type="submit" formAction={deleteGuideAction} formNoValidate>Remove</button>}
    </div>
  </form>;
}
