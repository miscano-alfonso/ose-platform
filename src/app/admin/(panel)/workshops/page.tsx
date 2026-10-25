import { getWorkshopsAdmin } from "@/lib/admin-data";
import { setWorkshopStatusAction } from "../../actions";
import { money } from "@/lib/format";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const PILL: Record<string, string> = { published: "good", draft: "mute", cancelled: "bad", completed: "info" };

export default async function Workshops() {
  const ws = await getWorkshopsAdmin();
  return <>
    <div className="top"><div><h1>Workshops</h1><div className="sub">Published workshops show on the website’s Other services page.</div></div></div>
    <div className="tw"><table>
      <thead><tr><th>Workshop</th><th>When</th><th>Teacher</th><th className="n">Price</th><th className="n">Booked</th><th>Status</th><th></th></tr></thead>
      <tbody>{ws.length === 0 ? <tr><td colSpan={7} className="empty">No workshops yet.</td></tr> : ws.map((w) => <tr key={w.id}>
        <td><b>{w.title}</b></td><td>{when(w.starts_at)}<div className="muted" style={{ fontSize: 12 }}>{w.minutes} minutes</div></td>
        <td>{w.teacher ?? <span className="muted">Not set</span>}</td><td className="n">{w.price_pence ? money(w.price_pence) : "Free"}</td>
        <td className="n">{w.booked}{w.capacity ? ` / ${w.capacity}` : ""}</td>
        <td><span className={`pill ${PILL[w.status]}`}>{w.status[0].toUpperCase() + w.status.slice(1)}</span></td>
        <td><form action={setWorkshopStatusAction} style={{ display: "flex", gap: 6 }}><input type="hidden" name="id" value={w.id} />
          {w.status !== "published" && <button className="abtn sm" name="status" value="published">Publish</button>}
          {w.status === "published" && <button className="abtn sm" name="status" value="draft">Unpublish</button>}
          {w.status !== "cancelled" && <button className="abtn sm" name="status" value="cancelled">Cancel</button>}
        </form></td></tr>)}</tbody>
    </table></div>
    <p className="note">Creating and editing workshops comes with the next update.</p>
  </>;
}
