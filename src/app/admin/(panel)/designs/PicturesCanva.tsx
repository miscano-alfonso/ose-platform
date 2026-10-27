import { canvaAppAction, canvaFolderAction, canvaDisconnectAction, deleteDesignAssetAction } from "../../actions";
import type { Asset } from "@/lib/designs";

type CanvaStatus = { hasApp: boolean; connected: boolean; clientId?: string; redirect: string; by?: string; at?: string; folderId?: string };
/** Social → Pictures & Canva: the Canva connection and the picture library (illustrations and photos brought in for posts). */
export function PicturesCanva({ canva, assets }: { canva: CanvaStatus; assets: Asset[] }) {
  const data = { assets };
  return <>
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
  </>;
}
