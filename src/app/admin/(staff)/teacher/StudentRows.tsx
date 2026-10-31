import Link from "next/link";
import { sendLabels } from "@/lib/send";
import type { MyStudent } from "@/lib/teacher-area";
import { dm } from "./fmt";

const age = (dob: string) => { const b = new Date(dob + "T12:00:00Z"), n = new Date(); let a = n.getUTCFullYear() - b.getUTCFullYear(); if (n < new Date(Date.UTC(n.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))) a--; return a; };
const attPill = (p: number | null) => p === null ? <span className="muted">—</span> : <span className={`pill ${p >= 90 ? "good" : p >= 75 ? "warn" : "bad"}`}>{p}%</span>;

/** The teacher's students as cards: name, classes with attendance, SEND (shared), Google account, birthday and points. */
export function StudentRows({ list, showClasses = true }: { list: MyStudent[]; showClasses?: boolean }) {
  return <div className="ms-grid">{list.map((s) => <article key={s.id} className={`ms-card${s.send ? " has-send" : ""}`} id={`s-${s.id}`}>
    <header><div><b>{s.name}</b>{s.known_as && <span className="muted"> · likes to be called {s.known_as}</span>}</div>
      {s.send && <span className="arr-needs">{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span>}</header>
    <dl className="ms-dl">
      {showClasses && <div><dt>Classes</dt><dd>{(s.classes ?? []).map((c) => <span key={c.id} className="ms-cls">{c.name} {attPill(c.lessons ? c.att : null)}</span>)}</dd></div>}
      {!showClasses && <div><dt>Attendance</dt><dd>{attPill((s.classes ?? [])[0]?.lessons ? (s.classes ?? [])[0].att : null)} <span className="muted">in this class</span></dd></div>}
      <div><dt>Points</dt><dd>{s.points} this term</dd></div>
      <div><dt>Google account</dt><dd>{s.email ?? <span className="muted">Not given</span>}{s.in_classroom === false && <span className="pill warn" style={{ marginLeft: 6 }}>Not in Classroom yet</span>}</dd></div>
      {(s.dob || s.year_group) && <div><dt>Age</dt><dd>{s.dob ? <>{age(s.dob)} · birthday {dm(s.dob)}</> : ""}{s.year_group ? `${s.dob ? " · " : ""}Year ${s.year_group}` : ""}</dd></div>}
      {s.send && <div className="ms-send"><dt>SEND</dt><dd>{s.send_details}{s.adjustments && <><br /><b>What helps:</b> {s.adjustments}</>}</dd></div>}
    </dl>
    <div className="ms-acts"><Link className="abtn sm" href={`/admin/messages/new?student=${s.id}`}>Message the family</Link></div>
  </article>)}</div>;
}

/** Column sorting for the list (31 Oct): ?sort=<key>&dir=desc, sorted on the server. Birthday sorts by the next one coming up. */
export const SORTS = ["name", "class", "att", "points", "send", "email", "bday"] as const;
export type SortKey = (typeof SORTS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc"; href: (key: SortKey, dir: "asc" | "desc") => string };
export const sortOf = (sp: { sort?: string; dir?: string }) => ({ key: (SORTS as readonly string[]).includes(sp.sort ?? "") ? sp.sort as SortKey : "name" as SortKey, dir: sp.dir === "desc" ? "desc" as const : "asc" as const });
const daysToBirthday = (dob: string | null) => {
  if (!dob) return null;
  const n = new Date(), t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()), b = new Date(dob + "T12:00:00Z");
  let d = Date.UTC(n.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()); if (d < t) d = Date.UTC(n.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate());
  return Math.round((d - t) / 864e5);
};
export function sortStudents(list: MyStudent[], key: SortKey, dir: "asc" | "desc"): MyStudent[] {
  const val = (s: MyStudent): string | number | null => key === "name" ? s.name.toLowerCase() : key === "class" ? ((s.classes ?? [])[0]?.name ?? "").toLowerCase()
    : key === "att" ? s.att : key === "points" ? s.points : key === "send" ? (s.send ? 0 : 1) : key === "email" ? (s.email ?? "").toLowerCase() || null : daysToBirthday(s.dob);
  const m = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;   // blanks always last
    return (x < y ? -m : x > y ? m : 0) || a.name.localeCompare(b.name);
  });
}
function Th({ k, label, sort, n }: { k: SortKey; label: string; sort?: Sort; n?: boolean }) {
  if (!sort) return <th className={n ? "n" : undefined}>{label}</th>;
  const on = sort.key === k, next = on && sort.dir === "asc" ? "desc" : "asc";
  return <th className={`${n ? "n " : ""}sorth`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
    <Link scroll={false} href={sort.href(k, next)} className={on ? "on" : undefined}>{label}<span className="sar" aria-hidden="true">{on ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}</span></Link></th>;
}

/** The same students as a table: one line each, with the Message button. Column headings sort when `sort` is given. */
export function StudentTable({ list, showClasses = true, sort }: { list: MyStudent[]; showClasses?: boolean; sort?: Sort }) {
  return <div className="tw"><table className="ms-table"><thead><tr><Th k="name" label="Student" sort={sort} />{showClasses && <Th k="class" label="Classes" sort={sort} />}
    <Th k="att" label="Attendance" sort={sort} n /><Th k="points" label="Points" sort={sort} n /><Th k="send" label="SEND" sort={sort} /><Th k="email" label="Google account" sort={sort} /><Th k="bday" label="Birthday" sort={sort} /><th /></tr></thead>
    <tbody>{list.map((s) => <tr key={s.id}>
      <td><b>{s.name}</b>{s.known_as && <div className="muted" style={{ fontSize: 13.5 }}>“{s.known_as}”</div>}</td>
      {showClasses && <td>{(s.classes ?? []).map((c) => <div key={c.id} className="ms-line">{c.name}</div>)}</td>}
      <td className="n">{(s.classes ?? []).length ? (s.classes ?? []).map((c) => <div key={c.id} className="ms-line">{attPill(c.lessons ? c.att : null)}</div>) : attPill(s.att)}</td><td className="n">{s.points}</td>
      <td>{s.send ? <span className="arr-needs" style={{ justifyContent: "flex-start" }} title={`${s.send_details ?? ""}${s.adjustments ? ` · What helps: ${s.adjustments}` : ""}`}>{sendLabels(s.needs, s.send_details).map((n) => <span key={n} className="pill warn">{n}</span>)}</span> : <span className="muted">—</span>}</td>
      <td>{s.email ?? <span className="muted">Not given</span>}{s.in_classroom === false && <div><span className="pill warn">Not in Classroom</span></div>}</td>
      <td>{s.dob ? <>{dm(s.dob)} <span className="muted">({age(s.dob)})</span></> : <span className="muted">—</span>}</td>
      <td><Link className="abtn sm" href={`/admin/messages/new?student=${s.id}`}>Message</Link></td></tr>)}</tbody></table></div>;
}

/** List (the default) or cards (?view=cards). */
export function ViewSwitch({ view, href }: { view: string; href: (v: string) => string }) {
  return <div className="segl" role="group" aria-label="View">{[["list", "List"], ["cards", "Cards"]].map(([k, l]) =>
    <Link key={k} scroll={false} href={href(k)} aria-current={view === k ? "true" : undefined}>{l}</Link>)}</div>;
}
