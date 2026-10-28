"use client";
import { useState } from "react";

type Opt = { value: string; label: string; count: number; group?: string; people?: { name: string; email: string }[] };
/** The "To" list of an email, with everyone it will go to (name and email) shown underneath, so it can be checked before sending. */
export function RecipientPicker({ options, initial }: { options: Opt[]; initial?: string }) {
  const [v, setV] = useState(options.some((o) => o.value === initial) ? initial! : options.find((o) => o.count)?.value ?? options[0]?.value);
  const [q, setQ] = useState("");
  const sel = options.find((o) => o.value === v);
  const groups = [...new Set(options.map((o) => o.group ?? "Other"))];
  const opt = (o: Opt) => <option key={o.value} value={o.value} disabled={!o.count}>{o.label} · {o.count} {o.count === 1 ? "person" : "people"}</option>;
  const people = (sel?.people ?? []).filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase()));
  return <>
    <label className="fld">To<select name="audience" required value={v} onChange={(e) => { setV(e.target.value); setQ(""); }}>
      {groups.length > 1 ? groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => (o.group ?? "Other") === g).map(opt)}</optgroup>) : options.map(opt)}</select></label>
    {sel?.people && <div className="rcp">
      <div className="rcp-h"><b>{sel.count} {sel.count === 1 ? "person" : "people"} will get this</b>{sel.count > 8 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a name or email" aria-label="Find a recipient" className="mini" />}</div>
      <ul>{people.map((p) => <li key={p.email}><span>{p.name}</span><span className="muted">{p.email}</span></li>)}</ul>
      {people.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Nobody matches.</p>}
    </div>}
  </>;
}
