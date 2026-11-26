import Link from "next/link";
import { getStyles, getDashStyles, type DashWho } from "@/lib/site-content";
import { StyleBuilder } from "./StyleBuilder";

const WHO: [DashWho, string][] = [["admin", "Admin"], ["teacher", "Teacher"], ["parent", "Parent"], ["student", "Student"]];
export default async function PageStyles({ searchParams }: { searchParams: Promise<{ ok?: string; tab?: string; who?: string }> }) {
  const sp = await searchParams;
  const dash = sp.tab === "dash";
  // 26 Nov: each dashboard (admin, teacher, parent, student) has its own settings; the others start from the admin's
  const who: DashWho = WHO.some(([k]) => k === sp.who) ? sp.who as DashWho : "admin";
  const savedAll = dash ? await getDashStyles(who) : await getStyles("site");
  const own = "own" in savedAll && !!savedAll.own;
  const { own: _o, ...saved } = savedAll as typeof savedAll & { own?: boolean }; void _o;
  return <>
    <div className="top"><div><h1>Page styles</h1><div className="sub">{dash ? "Fonts, text sizes and spacing for each dashboard. The teacher, parent and student dashboards use the admin settings until you save their own."
      : "Fonts, text sizes and spacing for the whole website."} Change a setting to see it on the right, then save to publish.</div></div><span className="grow" />
      <a className="abtn sm" href={dash ? (who === "admin" ? "/admin" : who === "teacher" ? "/admin/teacher" : `/${who}`) : "/"} target="_blank" rel="noreferrer">{dash ? "Open the dashboard" : "View the website"}</a></div>
    <nav className="seg sb-tabs" aria-label="What to style">
      <Link href="/admin/styles" className={dash ? "" : "on"} aria-current={dash ? undefined : "page"}>Website</Link>
      <Link href="/admin/styles?tab=dash" className={dash ? "on" : ""} aria-current={dash ? "page" : undefined}>Dashboards</Link>
    </nav>
    {dash && <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px", flexWrap: "wrap" }}><span className="muted">Which dashboard:</span>
      <nav className="seg sb-tabs" aria-label="Which dashboard" style={{ margin: 0 }}>{WHO.map(([k, l]) =>
      <Link key={k} href={`/admin/styles?tab=dash${k === "admin" ? "" : `&who=${k}`}`} className={who === k ? "on" : ""} aria-current={who === k ? "page" : undefined}>{l}</Link>)}</nav></div>}
    {dash && who !== "admin" && <p className="note">{own ? `The ${who} dashboard has its own settings.` : `The ${who} dashboard uses the admin settings. Change anything and save to give it its own.`}
      {(who === "parent" || who === "student") && <> To preview it here, first <Link href={`/admin/view-as?kind=${who === "parent" ? "p" : "s"}`}>view as a {who}</Link>, then come back.</>}</p>}
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <StyleBuilder key={dash ? `dash-${who}` : "site"} saved={saved} kind={dash ? "dash" : "site"} who={who} own={own} />
  </>;
}
