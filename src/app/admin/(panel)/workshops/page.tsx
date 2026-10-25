import Link from "next/link";
import { getWorkshopsAdmin } from "@/lib/admin-data";
import { setWorkshopStatusAction } from "../../actions";
import { money } from "@/lib/format";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const PILL: Record<string, string> = { published: "good", draft: "mute", cancelled: "bad", completed: "info" };

export default async function Workshops() {
  const ws = await getWorkshopsAdmin();
  return <>
    <div className="top"><div><h1>Workshops</h1><div className="sub">Published workshops show on the website’s Other services page.</div></div><span className="grow" /><Link className="abtn pri" href="/admin/workshops/new">Add a workshop</Link></div>
    <div className="tw"><table>
      <thead><tr><th>Workshop</th><th>When</th><th>Teacher</th><th className="n">Price</th><th className="n">Booked</th><th>Status</th><th></th></tr></thead>
      <tbody>{ws.length === 0 ? <tr><td colSpan={7} className="empty">No workshops yet.</td></tr> : ws.map((w) => <tr key={w.id}>
        <td><Link href={`/admin/workshops/${w.id}`}><b>{w.title}</b></Link></td><td>{when(w.starts_at)}<div className="muted" style={{ fontSize: 13.5 }}>{w.minutes} minutes</div></td>
        <td>{w.teacher ?? <span className="muted">Not set</span>}</td><td className="n">{w.price_pence ? money(w.price_pence) : "Free"}</td>
        <td className="n">{w.booked}{w.capacity ? ` / ${w.capacity}` : ""}</td>
        <td><span className={`pill ${PILL[w.status]}`}>{w.status[0].toUpperCase() + w.status.slice(1)}</span></td>
        <td><div className="acts">
          {w.status !== "published" && <WBtn id={w.id} status="published" label="Publish" />}
          {w.status === "published" && <WBtn id={w.id} status="draft" label="Unpublish" />}
          {w.status !== "cancelled" && <WBtn id={w.id} status="cancelled" label="Cancel" />}
          <Link className="abtn sm" href={`/admin/workshops/${w.id}`}>Edit</Link>
        </div></td></tr>)}</tbody>
    </table></div>
    <p className="note">Workshops can’t clash with the teacher’s lessons or 1:1s. Draft workshops stay off the website until you publish them.</p>
  </>;
}

function WBtn({ id, status, label }: { id: string; status: string; label: string }) {
  return <form action={setWorkshopStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className="abtn sm" type="submit">{label}</button></form>;
}
