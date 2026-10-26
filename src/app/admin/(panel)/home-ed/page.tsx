import { getHub, grouped, type HubLink } from "@/lib/hub";
import { saveHubSectionAction, addHubSectionAction, deleteHubSectionAction, saveHubLinkAction, deleteHubLinkAction } from "../../actions";

const KINDS: [HubLink["kind"], string][] = [["link", "Link"], ["video", "YouTube video"], ["date", "Date (timeline)"]];

export default async function HomeEdAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; s?: string }> }) {
  const sp = await searchParams;
  const hub = await getHub(true);
  const count = hub.reduce((n, s) => n + s.links.length, 0);
  return <>
    <div className="top"><div><h1>Home Ed hub</h1><div className="sub">The “New to Home Ed?” page: {hub.length} sections, {count} links. Changes show on the website straight away.</div></div><span className="grow" /><a className="abtn sm" href="/home-ed" target="_blank" rel="noreferrer">View the page</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    {sp.err && <p className="note msg err">{sp.err}</p>}
    <p className="note">Links with the same <b>group</b> are shown together under that sub-heading (for example a nation or a region). Lower order numbers come first. Every link must start with https://. Date items need no link; add one if you want a “Source” link.</p>
    {hub.map((s) => <details className="card" key={s.id} id={`s-${s.id}`} open={sp.s === s.id}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 19 }}>{s.title} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· {s.links.length} links</span>{!s.published && <> <span className="pill mute">Hidden</span></>}</summary>
      <form action={saveHubSectionAction} style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input type="hidden" name="id" value={s.id} />
        <label className="fld">Section heading<input name="title" required maxLength={120} defaultValue={s.title} style={{ maxWidth: 560 }} /></label>
        <label className="fld">Introduction<textarea name="intro" rows={4} maxLength={2000} defaultValue={s.intro} className="mini" style={{ width: "100%" }} /></label>
        <div className="eform"><label className="fld">Order<input name="sort" type="number" defaultValue={s.sort_order} style={{ width: 90 }} /></label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="published" defaultChecked={s.published} /> Show on the website</label>
          <button className="abtn" type="submit">Save section</button></div>
      </form>
      {grouped(s.links).map(([g, links]) => <div key={g || "_"} style={{ marginTop: 16 }}>
        <h3 style={{ fontWeight: 600, fontSize: 16, margin: "0 0 6px", color: "var(--muted)" }}>{g || "No group"}</h3>
        {links.map((l) => <details key={l.id} className="hubl"><summary><span>{l.title}</span><span className="muted">{KINDS.find(([k]) => k === l.kind)?.[1]}{!l.published && " · hidden"}</span></summary>
          <LinkForm sectionId={s.id} l={l} />
          <form action={deleteHubLinkAction} style={{ marginTop: 6 }}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="section" value={s.id} /><button className="abtn sm" type="submit">Delete this link</button></form>
        </details>)}
      </div>)}
      <div className="hubl-add"><h3 style={{ fontWeight: 600, fontSize: 16, margin: "18px 0 6px" }}>Add a link to this section</h3><LinkForm sectionId={s.id} groups={[...new Set(s.links.map((l) => l.grp).filter(Boolean))]} /></div>
      <form action={deleteHubSectionAction} className="eform" style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <input type="hidden" name="id" value={s.id} />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirm" required /> Delete this section and its {s.links.length} links</label>
        <button className="abtn sm" type="submit">Delete section</button>
      </form>
    </details>)}
    <form action={addHubSectionAction} className="card eform"><label className="fld">New section heading<input name="title" required maxLength={120} placeholder="e.g. SEND support" style={{ width: 320 }} /></label><button className="abtn" type="submit">Add section</button></form>
  </>;
}

function LinkForm({ sectionId, l, groups }: { sectionId: string; l?: HubLink; groups?: string[] }) {
  const list = `g-${sectionId}`;
  return <form action={saveHubLinkAction} className="hubl-form">
    <input type="hidden" name="id" value={l?.id ?? ""} /><input type="hidden" name="section" value={sectionId} />
    <label className="fld">Title<input name="title" required maxLength={200} defaultValue={l?.title} /></label>
    <label className="fld">Link<input name="url" type="url" pattern="https://.*" maxLength={1000} defaultValue={l?.url} placeholder="https://" /></label>
    <label className="fld">Group<input name="grp" maxLength={80} defaultValue={l?.grp} list={groups ? list : undefined} placeholder="e.g. England" />{groups && <datalist id={list}>{groups.map((g) => <option key={g} value={g} />)}</datalist>}</label>
    <label className="fld">Type<select name="kind" defaultValue={l?.kind ?? "link"}>{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
    <label className="fld wide">Description<textarea name="description" rows={2} maxLength={1000} defaultValue={l?.description} className="mini" /></label>
    <div className="eform wide"><label className="fld">Order<input name="sort" type="number" defaultValue={l?.sort_order} placeholder="last" style={{ width: 90 }} /></label>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="published" defaultChecked={l?.published ?? true} /> Show on the website</label>
      <button className="abtn" type="submit">{l ? "Save" : "Add link"}</button></div>
  </form>;
}
