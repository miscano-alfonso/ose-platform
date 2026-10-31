import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkshopEdit } from "@/lib/workshops-admin";
import { saveWorkshopAction } from "../../../actions";

const p2 = (n: number | null | undefined) => (n == null ? "" : (n / 100).toFixed(2));

export default async function EditWorkshop({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isNew = id === "new";
  const { w, levels, subjects, teachers } = await getWorkshopEdit(isNew ? null : id);
  if (!isNew && !w) notFound();
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/workshops">← Workshops</Link></p>
    <div className="top"><div><h1>{isNew ? "New workshop" : w!.title}</h1>{w && <div className="sub">{w.booked} booked · {w.status}</div>}</div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <form action={saveWorkshopAction} className="card" style={{ display: "grid", gap: 14 }} encType="multipart/form-data">
      <input type="hidden" name="id" value={isNew ? "" : id} />
      <label className="fld">Title<input name="title" required maxLength={120} defaultValue={w?.title} style={{ maxWidth: 520 }} /></label>
      <div className="eform">
        <label className="fld">Date<input type="date" name="date" required defaultValue={w?.date} /></label>
        <label className="fld">Starts (UK time)<input type="time" name="time" required step={300} defaultValue={w?.time ?? "10:00"} /></label>
        <label className="fld">Minutes<input type="number" name="minutes" min={15} max={240} step={5} defaultValue={w?.minutes ?? 45} style={{ width: 90 }} /></label>
        <label className="fld">Teacher<select name="teacher" defaultValue={w?.teacher_id ?? ""}><option value="">Not set</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </div>
      <div className="eform">
        <label className="fld">Level<select name="level" defaultValue={w?.level_id ?? ""}><option value="">Any level</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">Subject<select name="subject" defaultValue={w?.subject_id ?? ""}><option value="">None</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="fld">Places<input type="number" name="capacity" min={1} max={500} defaultValue={w?.capacity ?? 12} style={{ width: 90 }} /></label>
      </div>
      <div className="eform">
        <label className="fld">Price £ (0 = free)<input name="price" inputMode="decimal" defaultValue={p2(w?.price_pence ?? 0)} style={{ width: 100 }} /></label>
        <label className="fld">Price for enrolled families £ (optional)<input name="enrolled_price" inputMode="decimal" defaultValue={p2(w?.enrolled_price_pence)} style={{ width: 100 }} /></label>
        <label className="fld">Teacher is paid £<input name="pay" inputMode="decimal" defaultValue={p2(w?.teacher_pay_pence ?? 0)} style={{ width: 100 }} /></label>
      </div>
      <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}><legend>Card on the website (More page)</legend>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" name="size" value="single" defaultChecked={(w?.card_size ?? "single") === "single"} /> Single (one column)</label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" name="size" value="double" defaultChecked={w?.card_size === "double"} /> Double (two columns, picture beside the words)</label>
        </div></fieldset>
      <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {w?.image && <img src={w.image} alt="" width={192} height={108} style={{ borderRadius: 10, objectFit: "cover", width: 192, height: 108 }} />}
        <label className="fld">Picture (JPG, PNG or WebP, under 3 MB; wide pictures work best)<input type="file" name="image" accept="image/jpeg,image/png,image/webp" /></label>
        {w?.image && <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="remove_image" /> Remove the picture</label>}
      </div>
      <label className="fld">Short description (shown on the website)<textarea name="summary" rows={4} maxLength={1000} defaultValue={w?.summary ?? ""} className="mini" style={{ width: "100%" }} /></label>
      {isNew && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="publish" /> Publish on the website straight away</label>}
      <div><button className="abtn pri" type="submit">{isNew ? "Create workshop" : "Save changes"}</button></div>
    </form>
  </>;
}
