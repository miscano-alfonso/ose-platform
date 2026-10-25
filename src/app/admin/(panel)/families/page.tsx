import Link from "next/link";
import { getFamilies } from "@/lib/admin-data";
import { setCheckAction } from "../../actions";

export default async function Families({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const sp = await searchParams;
  const all = await getFamilies();
  const q = (sp.q ?? "").toLowerCase().trim();
  const list = all.filter((f) => (sp.show !== "checks" || f.checks > 0) &&
    (!q || [f.name, f.email, ...f.children.map((c) => c.name)].some((x) => x.toLowerCase().includes(q))));
  const kids = all.reduce((n, f) => n + f.children.length, 0), checks = all.reduce((n, f) => n + f.checks, 0);
  return <>
    <div className="top"><div><h1>Families</h1><div className="sub">{all.length} families · {kids} children · {checks} course places need a check</div></div>
      <span className="grow" /><Link className="abtn" href="/admin/import">Import families</Link></div>
    <form className="eform" style={{ marginBottom: 14 }}>
      <label className="fld">Search<input name="q" defaultValue={sp.q} placeholder="Parent, child or email" /></label>
      <label className="fld">Show<select name="show" defaultValue={sp.show ?? ""}><option value="">All families</option><option value="checks">Needs a check</option></select></label>
      <button className="abtn" type="submit">Filter</button>
    </form>
    {list.length === 0 && <p className="empty">{all.length ? "No families match." : "No families yet. Use Import families to bring them across from TechSaga."}</p>}
    {list.map((f) => <section className="card" key={f.id}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><h2>{f.name}</h2>
        <a href={`mailto:${f.email}`} className="muted">{f.email}</a>{f.phone && <span className="muted">{f.phone}</span>}
        {f.checks > 0 && <span className="pill warn">{f.checks} to check</span>}</div>
      {f.note && <p className="note msg" style={{ margin: "4px 0 8px" }}>{f.note}</p>}
      {f.children.map((c) => <div key={c.id} style={{ marginTop: 8 }}>
        <b>{c.name}</b>{c.email && <span className="muted" style={{ fontSize: 14.5 }}> · {c.email}</span>}
        {c.courses.length === 0 ? <p className="empty">No courses.</p> : c.courses.map((k) => <div className="li" key={k.id} style={{ alignItems: "flex-start" }}>
          <span className={`pill ${k.needs_check ? "warn" : k.status === "active" ? "good" : "mute"}`}>{k.needs_check ? "Needs a check" : k.status[0].toUpperCase() + k.status.slice(1)}</span>
          <div className="t"><b>{k.name} <span className="muted" style={{ fontWeight: 400 }}>({k.code})</span></b><span>Since {k.enrolled_on}{k.note ? ` · ${k.note}` : ""}</span></div>
          {k.needs_check && <form action={setCheckAction}><input type="hidden" name="id" value={k.id} /><button className="abtn sm" type="submit">Mark checked</button></form>}
        </div>)}
      </div>)}
    </section>)}
  </>;
}
