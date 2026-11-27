import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { visitorStats, type PersonRow, type Kind } from "@/lib/visitors";
import { hideVisitorAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitors" };

// Admin → Visitors (/visitors, 26 Nov): which teachers, parents and students have looked at their /newdashboard
// introduction page and signed in to their dashboard. A browser is tied to a person once it's signed in there.
const ROLES: { k: Kind; label: string; plural: "teachers" | "parents" | "students" }[] = [
  { k: "teacher", label: "Teachers", plural: "teachers" }, { k: "parent", label: "Parents", plural: "parents" }, { k: "student", label: "Students", plural: "students" }];
const SHOW = [["all", "Everyone"], ["used", "Signed in"], ["not", "Not signed in yet"], ["seen", "Seen the introduction"], ["unseen", "Not seen it"]] as const;
const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) + " " +
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
const PAGE = { teacher: "Teacher", parent: "Parent", student: "Student" } as const;
/** "London, GB" → 🇬🇧 (the country's flag) */
const flag = (place: string) => { const cc = place.match(/, ([A-Z]{2})$/)?.[1]; return cc ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : ""; };
const kindOf = (device: string) => /iPhone|Android phone/.test(device) ? "phone" : /iPad|tablet/.test(device) ? "tablet" : /bot|preview/.test(device) ? "link preview" : "computer";

export default async function Visitors({ searchParams }: { searchParams: Promise<{ role?: string; show?: string; office?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const hide = sp.office !== "show";   // 27 Nov (Alfonso): the office's own visits (his and Leanne's) are left out unless asked for
  const st = await visitorStats(hide);
  const role = ROLES.find((r) => r.k === sp.role) ?? ROLES[0];
  const show = SHOW.find(([k]) => k === sp.show)?.[0] ?? "all";
  const all = st[role.plural];
  const rows = all.filter((r) => show === "used" ? r.days > 0 : show === "not" ? r.days === 0 : show === "seen" ? !!r.pages?.length : show === "unseen" ? !r.pages?.length : true);
  const q = (o: { role?: string; show?: string; office?: string }) => `/admin/visitors?role=${o.role ?? role.k}&show=${o.show ?? show}${(o.office ?? (hide ? "" : "show")) ? `&office=${o.office ?? "show"}` : ""}`;
  const tile = (r: (typeof ROLES)[number]) => { const list = st[r.plural], used = list.filter((x) => x.days > 0).length, seen = list.filter((x) => x.pages?.length).length;
    return <Link key={r.k} href={q({ role: r.k, show: "all" })} className={`vs-tile${r.k === role.k ? " on" : ""}`}>
      <span className="k">{r.label}</span><b>{used}<small> of {list.length}</small></b><span>signed in to the dashboard</span><span>{seen} seen the introduction</span></Link>; };
  return <>
    <div className="top"><div><h1>Visitors</h1><div className="sub">Who has looked at the introduction pages (<a href="/newdashboard/teacher" target="_blank" rel="noopener">teacher</a>, <a href="/newdashboard/parent" target="_blank" rel="noopener">parent</a>, <a href="/newdashboard/student" target="_blank" rel="noopener">student</a>) and who has signed in to their dashboard. Counting started on 26 Nov 2026.</div></div></div>
    <div className="vs-tiles">{ROLES.map(tile)}
      <div className="vs-tile"><span className="k">Introduction pages</span><b>{st.views.reduce((a, v) => a + v.views, 0)}<small> views</small></b><span>{st.views7} in the last 7 days</span>
        <span>{ROLES.map((r) => { const v = st.views.find((x) => x.page === r.k); return `${PAGE[r.k]} ${v?.browsers ?? 0}`; }).join(" · ")} browsers</span></div></div>
    <section className="card">
      <div className="vs-bar"><div className="segl" role="group" aria-label="Who">{ROLES.map((r) => <Link key={r.k} href={q({ role: r.k })} aria-current={r.k === role.k ? "true" : undefined}>{r.label}</Link>)}</div>
        <div className="segl" role="group" aria-label="Show">{SHOW.map(([k, l]) => <Link key={k} href={q({ show: k })} aria-current={k === show ? "true" : undefined}>{l}</Link>)}</div></div>
      {rows.length === 0 ? <p className="empty">Nobody here.</p> : <div className="tw"><table className="vs-table"><thead><tr>
        <th>{role.label.slice(0, -1)}</th><th>Introduction page</th><th>Dashboard</th><th>Days used</th></tr></thead><tbody>
        {rows.map((r: PersonRow) => <tr key={r.id}>
          <td><b>{r.name}</b><span className="muted">{role.k === "parent" ? (r.detail ? `Parent of ${r.detail}` : "") : r.detail}</span>
            {/* 27 Nov: teachers sign in with an emailed one-time link (update 476), so there's no invite or password to wait for */}</td>
          <td>{r.pages?.length ? <><span className="pill good">Seen</span><span className="muted">{when(r.seen_first)}{r.seen_last && r.seen_last !== r.seen_first ? ` · last ${when(r.seen_last)}` : ""}</span>
              {r.pages.some((p) => p !== role.k) && <span className="muted">also the {r.pages.filter((p) => p !== role.k).join(" and ")} page</span>}</>
            : <span className="pill mute">Not seen</span>}</td>
          <td>{r.days ? <><span className="pill good">Signed in</span><span className="muted">first {when(r.dash_first)} · last {when(r.dash_last)}</span></> : <span className="pill mute">Not yet</span>}</td>
          <td className="num">{r.days || "–"}</td></tr>)}</tbody></table></div>}
      <p className="note">{st.views.reduce((a, v) => a + v.unknown, 0)} browser{st.views.reduce((a, v) => a + v.unknown, 0) === 1 ? "" : "s"} looked at an introduction page but haven’t signed in on that browser yet, so we don’t know who they are. Teachers are matched the next time they open their dashboard on the same browser; parents and students as soon as they’re signed in. Admins “Viewing as” someone aren’t counted.</p>
    </section>
    {/* 27 Nov (Alfonso): every visit to the introduction pages, including people who haven't signed in */}
    <section className="card" id="log"><div className="vs-bar"><h2 style={{ margin: 0 }}>Every visit</h2>
        <div className="segl" role="group" aria-label="The office’s visits"><Link href={`${q({ office: "" })}#log`} aria-current={hide ? "true" : undefined}>Hide the office’s visits</Link><Link href={`${q({ office: "show" })}#log`} aria-current={!hide ? "true" : undefined}>Show them</Link></div></div>
      <p className="cs">Each time someone opens an introduction page, newest first. Each browser has its own visitor code, the same on later visits; the name appears once that person signs in to their dashboard on the same browser. <b>Hide</b> leaves out every visit from that browser (for example your own). {hide ? "Visits by the office (anyone using this admin, on any browser they’ve used it on) are left out here and in the views counts at the top." : "Visits by the office are marked Office."}</p>
      {st.log.length === 0 ? <p className="empty">No visits yet.</p> : <div className="tw"><table className="vs-table"><thead><tr><th>When</th><th>Visitor</th><th>Place</th><th>Page</th><th>Who</th><th></th></tr></thead><tbody>
        {st.log.map((v, i) => <tr key={i} className={v.hidden ? "vs-hid" : undefined}><td>{when(v.at)}</td>
          <td><code className="vs-code" title={`Browser ${v.browser}`}>{v.code}</code>{v.visits > 1 && <span className="muted">{v.visits} visits</span>}</td>
          <td>{v.place ? <>{flag(v.place)} {v.place.replace(/, [A-Z]{2}$/, "")}</> : <span className="muted">Not recorded</span>}<span className="muted">{v.device ? kindOf(v.device) : ""}</span></td>
          <td>{PAGE[v.page] ?? v.page}</td>
          <td>{v.who ? <><b>{v.who}</b><span className="muted">{v.whoKind ? PAGE[v.whoKind] : ""}</span></> : v.staff ? <span className="pill info">{v.hidden ? "Hidden" : "Office"}</span> : <span className="muted">Not known yet</span>}</td>
          <td><form action={hideVisitorAction}><input type="hidden" name="code" value={v.code} /><input type="hidden" name="hide" value={v.hidden ? "0" : "1"} /><input type="hidden" name="q" value={hide ? "" : "office=show"} />
            <button className="abtn sm" type="submit" title={v.hidden ? "Show this visitor’s visits again" : "Hide every visit from this browser (e.g. your own)"}>{v.hidden ? "Show" : "Hide"}</button></form></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
