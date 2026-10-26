import { requireParent } from "@/lib/family-auth";
import { familyWorkshops } from "@/lib/family";
import { bookWorkshopAction } from "../../actions";
import { Head, Flash, dlong, hm, gbp } from "../../fmt";

export default async function Workshops({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const { workshops, children } = await familyWorkshops(f.id);
  return <>
    <Head title="Workshops" sub="One-off lessons, in term time and the holidays" />
    <Flash sp={sp} />
    {workshops.length === 0 ? <p className="empty">No workshops coming up.</p> : <div className="pgrid2" style={{ marginTop: 0 }}>{workshops.map((w) => { const price = w.enrolled_price ?? w.price;
      const can = children.filter((k) => !w.booked.includes(`${k.first} ${k.last}`));
      return <section className="card" key={w.id} style={{ margin: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{w.level && <span className="pill mute">{w.level}</span>}
          <span className={`pill ${price ? "info" : "good"}`}>{price ? `${gbp(price)}${w.enrolled_price != null && w.enrolled_price < w.price ? ` (usually ${gbp(w.price)})` : ""}` : w.price ? `Free for you (usually ${gbp(w.price)})` : "Free"}</span></div>
        <h2 style={{ margin: "8px 0 4px" }}>{w.title}</h2><p className="note" style={{ margin: 0 }}>{dlong(w.at)}, {hm(w.at)} · {w.minutes} minutes{w.teacher ? ` · ${w.teacher}` : ""} · Google Meet</p>
        {w.summary && <p className="cs" style={{ marginTop: 8 }}>{w.summary}</p>}
        {w.booked.length > 0 && <p><span className="pill good">Booked for {w.booked.map((n) => n.split(" ")[0]).join(" and ")}</span></p>}
        {can.length > 0 && (w.places == null || w.places > 0) ? <form action={bookWorkshopAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <input type="hidden" name="workshop" value={w.id} /><select name="student" className="mini" aria-label="Child">{can.map((k) => <option key={k.id} value={k.id}>{k.first}</option>)}</select>
          <button className="abtn sm pri" type="submit">{price ? `Book (${gbp(price)})` : "Book a free place"}</button>{w.places != null && <span className="note">{w.places} places left</span>}</form>
          : w.places != null && w.places <= 0 ? <p className="note">Fully booked.</p> : null}
      </section>; })}</div>}
  </>;
}
