import Link from "next/link";
import type { Group } from "@/lib/search";

/** 27 Nov: the full results page for the side-menu search (admin and teacher). */
export function SearchResults({ q, groups, action, hint }: { q: string; groups: Group[]; action: string; hint: string }) {
  const n = groups.reduce((a, g) => a + g.hits.length, 0);
  return <>
    <div className="top"><div><h1>Search</h1><div className="sub">{hint}</div></div></div>
    <form method="get" action={action} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input name="q" defaultValue={q} placeholder="Type a name, class, email or page" aria-label="Search" className="mini" style={{ width: 420, maxWidth: "100%" }} autoFocus autoComplete="off" />
      <button className="abtn pri" type="submit">Search</button></form>
    {!q.trim() ? <p className="empty">Type at least two letters.</p> : n === 0 ? <p className="empty">Nothing found for “{q}”.</p>
      : <div className="srch-grid">{groups.map((g) => <section className="card" key={g.key}><h2 style={{ marginTop: 0 }}>{g.label} <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>{g.hits.length}{g.more ? "+" : ""}</span></h2>
        <ul className="srch-list">{g.hits.map((h, i) => <li key={h.href + i}><Link href={h.href}><b>{h.title}</b>{h.sub && <span>{h.sub}</span>}</Link></li>)}</ul>
        {g.more && <p className="note" style={{ marginBottom: 0 }}>Showing the first {g.hits.length}. Add another word to narrow it down.</p>}</section>)}</div>}
  </>;
}
