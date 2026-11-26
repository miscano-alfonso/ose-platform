import type { Metadata } from "next";
import { headers } from "next/headers";
import { PAGES, type Role } from "./content";
import { ShareLink } from "./ShareLink";

// /newdashboard (26 Nov): the three introduction pages in one place, each with its link to copy or share. Unlisted.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New dashboards: links to share", robots: { index: false, follow: false } };
const WHO: Record<Role, string> = { teacher: "For teachers", parent: "For parents", student: "For students" };

export default async function NewDashboards() {
  const h = await headers();
  const base = (process.env.SITE_URL || `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`).replace(/\/$/, "");
  const roles = Object.keys(PAGES) as Role[];
  /* eslint-disable @next/next/no-img-element */
  return <>
    <section className="s-phead"><div className="wrap"><h1>New dashboards</h1>
      <p>The introduction pages for teachers, parents and students. Copy a link, or share it straight to email or WhatsApp. Anyone opening one needs the website password while the site is being finished.</p></div></section>
    <section className="s-sec"><div className="wrap"><div className="ndl-grid">
      {roles.map((r) => { const p = PAGES[r], url = `${base}/newdashboard/${r}`, lead = p.lead.split(/(?<=\.)\s/)[0];
        return <article key={r} className="ndl-card">
          <a className="ndl-pic" href={`/newdashboard/${r}`} target="_blank" rel="noopener" aria-label={`Open ${p.title} (new tab)`}>
            <img className="nd-l" src={`/newdashboard/${r}-home-light.webp`} alt="" width={1600} height={1000} loading="lazy" />
            <img className="nd-d" src={`/newdashboard/${r}-home-dark.webp`} alt="" width={1600} height={1000} loading="lazy" /></a>
          <div className="ndl-body">
            <span className="gd-k">{WHO[r]}</span>
            <h2>{p.title}</h2>
            <p>{lead}</p>
            <code className="ndl-url">{url.replace(/^https?:\/\//, "")}</code>
            <ShareLink url={url} title={p.title} text={`${p.title} at OH-SO ED:`} />
            <a className="ndl-open" href={`/newdashboard/${r}`} target="_blank" rel="noopener">Open the page ↗<span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        </article>; })}
    </div></div></section>
  </>;
}
