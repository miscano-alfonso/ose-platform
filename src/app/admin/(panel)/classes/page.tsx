import { getGroups } from "@/lib/admin-data";
import { classFormOptions } from "@/lib/rules";
import { updateGroupAction, addClassAction } from "../../actions";
import { yearLabel } from "@/lib/format";

const MODE: Record<string, string> = { auto: "Close when full", keep_open: "Keep open past capacity", full: "Mark as full now" };
const LABEL: Record<string, string> = { auto: "Automatic", off: "No label", few_spaces: "Few spaces left", almost_full: "Almost full", new_group: "New Group!", launching_soon: "New Group Launching Soon!" };
const STATUS: Record<string, string> = { open: "Open", waitlist: "Waiting list", priority: "Waiting-list priority", closed: "Closed", hidden: "Hidden" };
const HOME: Record<string, string> = { auto: "Automatic (when places are free)", show: "Always show", hide: "Never show" };
const onHome = (g: { homepage: string; bookable: boolean; status: string }) => g.status !== "hidden" && g.status !== "closed" && (g.homepage === "show" || (g.homepage === "auto" && g.bookable));
const statusPill = (s: string, full: boolean) => full && (s === "open" || s === "priority") ? <span className="pill warn">Full</span>
  : s === "open" ? <span className="pill good">Open</span> : s === "waitlist" || s === "priority" ? <span className="pill info">{STATUS[s]}</span> : <span className="pill mute">{STATUS[s]}</span>;

export default async function Classes({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [groups, opts] = await Promise.all([getGroups(), classFormOptions()]);
  const years = [...new Set(groups.map((g) => g.year_label))];
  return <>
    <div className="top"><div><h1>Classes</h1><div className="sub">{groups.length} classes. Edit a row to change its capacity, override, website label, status or whether it shows under Space Available on the homepage.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <details className="card" open={!!sp.err}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Add a class</summary>
      <form action={addClassAction} className="eform" style={{ marginTop: 12 }}>
        <label className="fld">Course<select name="course" required defaultValue=""><option value="" disabled>Choose</option>
          {opts.years.map((y) => <optgroup key={y.id} label={y.label}>{opts.rules.filter((r) => r.year_id === y.id).map((r) => <option key={r.level_id + r.subject_id} value={`${y.id}|${r.level_id}|${r.subject_id}`}>{r.level} {r.subject}</option>)}</optgroup>)}</select></label>
        <label className="fld">Places<input name="capacity" type="number" min={1} max={200} defaultValue={12} style={{ width: 90 }} /></label>
        <label className="fld">Status<select name="status" defaultValue="hidden"><option value="hidden">Hidden (add times first)</option><option value="open">Open</option><option value="waitlist">Waiting list</option></select></label>
        <button className="abtn pri" type="submit">Add class</button></form>
      <p className="cs" style={{ marginTop: 8 }}>The list shows the subjects set up in Prices &amp; rules, which also sets the price. Then add lesson times and the teacher under Timetable.</p></details>
    {years.map((y) => <div key={y}>
      {years.length > 1 && <h2 style={{ font: "600 20px Jost", margin: "8px 0 10px" }}>{yearLabel(y)}</h2>}
      <div className="tw"><table>
        <thead><tr><th>Class</th><th>Teacher</th><th>Lessons</th><th>Places</th><th>Status</th><th>Website label</th><th>Homepage</th></tr></thead>
        {groups.filter((g) => g.year_label === y).map((g) => {
          const pct = g.capacity ? Math.min(100, Math.round((g.taken / g.capacity) * 100)) : 0;
          return <tbody key={g.id}>
            <tr>
              <td><span className="dot" style={{ background: g.colour }} /><b>{g.level} {g.subject}</b><div className="muted" style={{ fontSize: 15.5, marginLeft: 18 }}>{g.code}</div></td>
              <td>{g.teacher ?? <span className="muted">Not set</span>}</td>
              <td>{g.slots ?? <span className="muted">No lessons yet</span>}</td>
              <td><div className="fill"><div className="track"><i className={g.is_full ? "full" : ""} style={{ width: `${pct}%` }} /></div><span>{g.taken}/{g.capacity ?? "∞"}</span></div>
                {g.capacity_mode !== "auto" && <div className="muted" style={{ fontSize: 13.5 }}>{MODE[g.capacity_mode]}</div>}
                {g.waiting > 0 && <div className="muted" style={{ fontSize: 13.5 }}>{g.waiting} waiting</div>}</td>
              <td>{statusPill(g.status, g.is_full)}</td>
              <td>{g.label ?? <span className="muted">None</span>}{g.sticky_label !== "auto" && <div className="muted" style={{ fontSize: 13.5 }}>set by hand</div>}</td>
              <td>{onHome(g) ? <span className="pill good">Space Available</span> : <span className="muted">Not shown</span>}
                {g.homepage !== "auto" && <div className="muted" style={{ fontSize: 13.5 }}>set by hand{g.homepage_order ? ` · position ${g.homepage_order}` : ""}</div>}</td>
            </tr>
            <tr className="editrow"><td colSpan={7} style={{ paddingTop: 6, paddingBottom: 8 }}>
              <details className="edit"><summary className="abtn sm">Edit {g.code}</summary>
                <form action={updateGroupAction} className="eform" style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={g.id} />
                  <label className="fld">Capacity<input type="number" name="capacity" min={1} max={200} defaultValue={g.capacity ?? ""} style={{ width: 90 }} /></label>
                  <label className="fld">When full<select name="capacity_mode" defaultValue={g.capacity_mode}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Website label<select name="sticky_label" defaultValue={g.sticky_label}>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Status<select name="status" defaultValue={g.status}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Space Available on homepage<select name="homepage" defaultValue={g.homepage}>{Object.entries(HOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="fld">Position<input type="number" name="homepage_order" min={1} max={99} placeholder="Auto" defaultValue={g.homepage_order ?? ""} style={{ width: 80 }} /></label>
                  <button className="abtn pri" type="submit">Save</button>
                </form></details></td></tr>
          </tbody>;
        })}
      </table></div>
    </div>)}
    <p className="note">“Keep open past capacity” lets families keep booking a full class. “Mark as full now” closes booking and shows the waiting list. “Space Available” on the homepage shows open classes with places left automatically; choose “Always show” or “Never show” to set it by hand, and a position to change the order (1 comes first). Every change is recorded in the audit log.</p>
  </>;
}
