import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PAGES, type Role, type Section } from "../content";

// /newdashboard/teacher, /parent and /student (25 Nov): unlisted pages introducing the new dashboards, section by section,
// with a sticky button that opens that dashboard in the demo school (made-up data, read-only).
export const dynamic = "force-dynamic";
const ROLES = Object.keys(PAGES) as Role[];
const page = (r: string) => (ROLES.includes(r as Role) ? PAGES[r as Role] : null);

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }): Promise<Metadata> {
  const p = page((await params).role);
  return { title: p?.title ?? "New dashboards", robots: { index: false, follow: false } };
}

function Shot({ role, name, alt, phone }: { role: Role; name: string; alt: string; phone?: boolean }) {
  const src = (t: string) => `/newdashboard/${role}-${name}-${t}.webp`;
  const [w, h] = phone ? [780, 1328] : [1600, 1000];
  /* eslint-disable @next/next/no-img-element */
  return <figure className={phone ? "nd-phone" : "nd-shot"}>
    {!phone && <span className="nd-bar" aria-hidden="true"><i /><i /><i /></span>}
    <img className="nd-l" src={src("light")} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
    <img className="nd-d" src={src("dark")} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
  </figure>;
}

function Block({ role, s, i }: { role: Role; s: Section; i: number }) {
  return <section className={`nd-sec${s.shot ? "" : " nd-noshot"}${i % 2 ? " flip" : ""}`} id={s.id} aria-labelledby={`h-${s.id}`}>
    <div className="nd-text">
      <p className="nd-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</p>
      <h2 id={`h-${s.id}`}>{s.title}</h2>
      <p>{s.text}</p>
      {s.points.length > 0 && <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>}
    </div>
    {s.shot && <Shot role={role} name={s.shot} alt={s.alt} />}
  </section>;
}

export default async function NewDashboard({ params, searchParams }: { params: Promise<{ role: string }>; searchParams: Promise<{ demo?: string }> }) {
  const [{ role }, sp] = await Promise.all([params, searchParams]);
  const p = page(role);
  if (!p) notFound();
  const demo = `/newdashboard/${p.role}/demo`, who = p.role === "teacher" ? "teacher" : p.role;
  return (<>
    <section className="s-phead nd-head"><div className="wrap">
      <div className="nd-hgrid">
        <div>
          <p className="nd-eyebrow">New for {p.label.toLowerCase()} · from January 2027</p>
          <h1>{p.title}</h1>
          <p>{p.lead}</p>
        </div>
        <Shot role={p.role} name="phone" alt={`The ${who} dashboard on a phone`} phone />
      </div>
    </div></section>
    <div className="nd-sticky"><a className="nd-go" href={demo}>Try the demo {who} dashboard <span aria-hidden="true">→</span></a></div>
    <div className="s-sec nd-body"><div className="wrap">
      {sp.demo && <p className="notice err" role="alert">{sp.demo.slice(0, 200)}</p>}
      <ul className="nd-high">{p.highlights.map((h) => <li key={h.t}><b>{h.t}</b><span>{h.d}</span></li>)}</ul>
      <nav className="nd-jump" aria-label="On this page">{p.sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav>
      {p.sections.map((s, i) => <Block key={s.id} role={p.role} s={s} i={i} />)}
      <section className="nd-start" aria-labelledby="h-start">
        <h2 id="h-start">Getting started</h2>
        <ul>{p.signIn.map((x) => <li key={x.title}><b>{x.title}</b><span>{x.text}</span></li>)}</ul>
      </section>
      <section className="nd-end">
        <h2>Have a look round</h2>
        <p>{p.demoNote}</p>
        <a className="wk-go" href={demo}>Try the demo {who} dashboard</a>
      </section>
    </div></div>
  </>);
}
