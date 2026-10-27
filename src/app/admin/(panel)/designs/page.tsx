import Link from "next/link";
import { headers } from "next/headers";
import { studioData, canvaStatus } from "@/lib/designs";
import { siteBase, aiReady } from "@/lib/social";
import { withSchool } from "@/lib/db";
import { canvaAppAction, canvaFolderAction, canvaDisconnectAction, deleteDesignAssetAction } from "../../actions";
import Studio from "./Studio";
import "./designs.css";

export const dynamic = "force-dynamic";

export default async function Designs({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string; purpose?: string }> }) {
  const sp = await searchParams; const tab = sp.tab === "library" ? "library" : "make";
  const h = await headers(); const base = await siteBase(`${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`);
  const [data, canva, brand] = await Promise.all([studioData(), canvaStatus(base),
    withSchool((q) => q<{ brand: { primary?: string } }>(`select brand from schools where id = current_school()`)).then((r) => r[0]?.brand ?? {})]);
  const navy = typeof brand.primary === "string" && /^#[0-9a-f]{6}$/i.test(brand.primary) ? brand.primary : "#141a5c";
  return <>
    <div className="top"><div><h1>Post designs</h1><div className="sub">Social posts in the OH-SO ED style, filled in from your courses, teachers and term dates. Pick a design, change the words, then post it or download it.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <div className="segl" role="tablist" style={{ marginBottom: 14 }}><Link href="/admin/designs" aria-current={tab === "make" ? "true" : undefined}>Make a post</Link><Link href="/admin/designs?tab=library" aria-current={tab === "library" ? "true" : undefined}>Library &amp; Canva ({data.assets.length})</Link></div>
    {tab === "make" ? <Studio data={data} navy={navy} canva={canva.connected} purpose={sp.purpose} ai={await aiReady().catch(() => false)} /> : <>
      <section className="card"><h2>Canva</h2>
        <p className="cs">Bring illustrations in from your own Canva designs (read-only). Canva’s own stock library can’t be searched from outside Canva, so make or save each illustration as a design in Canva first, ideally all in one folder.</p>
        {!canva.hasApp ? <>
          <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Signed in to Canva, open the <a href="https://www.canva.com/developers/" target="_blank" rel="noopener">Canva Developer Portal</a> → <b>Your apps</b> → <b>Create an app</b>. Name it (e.g. “OH-SO ED site”), choose <b>Public</b> (Private needs a Canva Enterprise plan) and don’t submit it for review: it works for your own account as it is.</li>
            <li>Go to <b>Outside Canva</b> → <b>Start integrating</b>. Under <b>Scopes</b>, tick read for <b>design:meta</b>, <b>design:content</b> and <b>folder</b>.</li>
            <li>Under <b>Outside Canva → Redirect URLs</b>, add this as URL 1:<br /><code style={{ userSelect: "all" }}>{canva.redirect}</code></li>
            <li>Under <b>Credentials</b>, copy the Client ID, press <b>Generate secret</b>, then paste both below yourself.</li></ol>
          <form action={canvaAppAction} className="eform"><label className="fld">Client ID<input name="client_id" type="text" required autoComplete="off" spellCheck={false} data-1p-ignore="" data-lpignore="true" style={{ width: 260 }} /></label>
            <label className="fld">Client secret<input name="client_secret" type="text" required autoComplete="off" spellCheck={false} data-1p-ignore="" data-lpignore="true" style={{ width: 260 }} /></label><button className="abtn" type="submit">Save</button></form></>
        : !canva.connected ? <><p>Client ID saved{canva.clientId ? ` (${canva.clientId.slice(0, 6)}…)` : ""}. Redirect URL: <code style={{ userSelect: "all" }}>{canva.redirect}</code></p>
            <a className="abtn pri" href="/admin/design-api?action=canvalogin">Connect Canva</a>
            <form action={canvaDisconnectAction} style={{ marginTop: 10 }}><input type="hidden" name="forget" value="1" /><button className="lnk" type="submit">Remove the saved Client ID</button></form></>
        : <><p>Connected by {canva.by}{canva.at ? ` on ${new Date(canva.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}. {canva.folderId ? <>“From Canva” opens your chosen folder.</> : <>“From Canva” shows your most recent designs.</>}</p>
            <form action={canvaFolderAction} className="eform"><label className="fld">Illustrations folder (optional)<input name="folder" defaultValue={canva.folderId ? `https://www.canva.com/folder/${canva.folderId}` : ""} placeholder="Paste the folder’s link from Canva" style={{ width: 360 }} /></label><button className="abtn" type="submit">Save folder</button></form>
            <form action={canvaDisconnectAction} style={{ marginTop: 10 }}><button className="lnk" type="submit">Disconnect Canva</button></form></>}
      </section>
      <section className="card"><h2>Library</h2><p className="cs">Illustrations and photos for the designs. Line drawings are tinted to match each post; photos can be used as they are.</p>
        {data.assets.length === 0 ? <p className="empty">Nothing yet. Choose “Upload a picture” or “From Canva” when making a post.</p> :
          <div className="ds-grid">{data.assets.map((a) => <div key={a.id} className="ds-tile" style={{ cursor: "default" }}><img src={`/admin/design-api?action=asset&id=${a.id}`} alt="" loading="lazy" />
            <span>{a.name}{a.source === "canva" ? " · Canva" : ""}</span><form action={deleteDesignAssetAction}><input type="hidden" name="id" value={a.id} /><button className="lnk" type="submit">Remove</button></form></div>)}</div>}</section>
    </>}
  </>;
}
