import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { listTrials, STATUSES } from "@/lib/edtech";
import { edtechTrialAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "EdTech trials" };
const when = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const PLAN: Record<string, string> = { solo: "Solo", growth: "Growth", school: "School", "": "Not sure" };

export default async function EdTechTrials({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireStaff(); const sp = await searchParams;
  const rows = await listTrials();
  const fresh = rows.filter((r) => r.status === "new").length;
  return <>
    <div className="top"><div><h1>OH-SO EdTech trials</h1><div className="sub">Teachers who asked for a free trial on <a href="/osedtech" target="_blank" rel="noopener">the OH-SO EdTech website</a>. Each request is also emailed to you. {fresh ? `${fresh} new.` : ""}</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    {rows.length === 0 ? <p className="empty">No requests yet.</p> : <div className="tw"><table><thead><tr><th>When</th><th>Who</th><th>School</th><th>Size</th><th>Plan</th><th>Details</th><th>Status and notes</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}>
        <td style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
        <td><b>{r.name}</b><br /><a href={`mailto:${r.email}`}>{r.email}</a></td>
        <td>{r.business}{r.website && <><br /><a href={r.website} target="_blank" rel="noopener noreferrer">{r.website.replace(/^https?:\/\//, "")}</a></>}</td>
        <td>{[r.teachers && `${r.teachers} teachers`, r.students && `${r.students} students`].filter(Boolean).join(", ") || "—"}</td>
        <td>{PLAN[r.plan] ?? r.plan}</td>
        <td style={{ maxWidth: 320 }}>{r.subjects && <div><span className="muted">Teaches:</span> {r.subjects}</div>}{r.tools && <div><span className="muted">Uses now:</span> {r.tools}</div>}{r.message && <div style={{ whiteSpace: "pre-wrap" }}>{r.message}</div>}</td>
        <td><form action={edtechTrialAction} style={{ display: "grid", gap: 6, minWidth: 200 }}><input type="hidden" name="id" value={r.id} />
          <select name="status" defaultValue={r.status} className="mini">{STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
          <textarea name="note" defaultValue={r.note} rows={2} className="mini" placeholder="Notes" />
          <button className="abtn sm" type="submit">Save</button></form></td>
      </tr>)}</tbody></table></div>}
  </>;
}
