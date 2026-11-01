import type { Metadata } from "next";
import { getGuides, AUDIENCES, KINDS } from "@/lib/guides";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guides", description: "How to use the OH-SO ED dashboards: guides for teachers, parents and students.", robots: { index: false, follow: false } };

// Guides (2 Nov): presentations and how-to guides for teachers, parents and students. Open to anyone with the link;
// not in the menu. Each part has its own address (/guides#teachers, #parents, #students). Managed in Admin → Website → Guides.
export default async function Guides() {
  const guides = await getGuides();
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Guides</h1><p>Short guides to the OH-SO ED dashboards: what everything does and how to get the most from it.</p>
      <nav className="gd-jump" aria-label="Jump to">{AUDIENCES.map((a) => <a key={a.id} href={`#${a.id}`}>{a.label}</a>)}</nav></div></section>
    <section className="s-sec"><div className="wrap gd-wrap">{AUDIENCES.map((a) => { const list = guides.filter((g) => g.audience === a.id);
      return <section key={a.id} id={a.id} className="gd-sec"><div className="gd-head"><h2>For {a.label.toLowerCase()}</h2><p>{a.intro}</p></div>
        {list.length === 0 ? <p className="gd-soon">Coming soon.</p>
        : <div className="gd-grid">{list.map((g) => { const k = KINDS.find((x) => x.id === g.kind) ?? KINDS[3];
          return <a key={g.id} className="gd-card" href={g.url} target="_blank" rel="noopener"><span className="gd-k">{k.label}</span><h3>{g.title}</h3>
            {g.description && <p>{g.description}</p>}<span className="gd-go">{k.action} →</span></a>; })}</div>}
      </section>; })}</div></section>
  </>);
}
