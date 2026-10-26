import Link from "next/link";
import { getStyles } from "@/lib/site-content";
import { StyleBuilder } from "./StyleBuilder";

export default async function PageStyles({ searchParams }: { searchParams: Promise<{ ok?: string; tab?: string }> }) {
  const sp = await searchParams;
  const dash = sp.tab === "dash";
  const saved = await getStyles(dash ? "dash" : "site");
  return <>
    <div className="top"><div><h1>Page styles</h1><div className="sub">{dash ? "Fonts, text sizes and spacing for the dashboards: admin and teacher now, and the parent and student areas when they open."
      : "Fonts, text sizes and spacing for the whole website."} Change a setting to see it on the right, then save to publish.</div></div><span className="grow" />
      <a className="abtn sm" href={dash ? "/admin" : "/"} target="_blank" rel="noreferrer">{dash ? "Open the dashboard" : "View the website"}</a></div>
    <nav className="seg sb-tabs" aria-label="What to style">
      <Link href="/admin/styles" className={dash ? "" : "on"} aria-current={dash ? undefined : "page"}>Website</Link>
      <Link href="/admin/styles?tab=dash" className={dash ? "on" : ""} aria-current={dash ? "page" : undefined}>Dashboards</Link>
    </nav>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <StyleBuilder key={dash ? "dash" : "site"} saved={saved} kind={dash ? "dash" : "site"} />
  </>;
}
