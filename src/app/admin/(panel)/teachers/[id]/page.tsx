import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeacherAdmin } from "@/lib/teachers-admin";
import { saveTeacherAction, archiveTeacherAction } from "../../../actions";

export default async function EditTeacher({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { teacher: t, subjects } = await getTeacherAdmin(id);
  if (!t) notFound();
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/teachers">← Teachers</Link></p>
    <div className="top"><div><h1>{t.name}</h1><div className="sub">{t.email}{t.slug ? ` · ohsoed.co.uk/teachers/${t.slug}` : ""}</div></div><span className="grow" />
      {t.slug && !t.archived && <a className="abtn sm" href={`/teachers/${t.slug}`} target="_blank" rel="noreferrer">View on the website</a>}</div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <form action={saveTeacherAction} className="card" encType="multipart/form-data" style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="id" value={t.id} />
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {t.photo ? <img src={t.photo} alt="" width={200} height={150} style={{ width: 200, height: 150, objectFit: "cover", borderRadius: 12 }} /> : <div className="avatar" style={{ width: 120, height: 120, fontSize: 40 }}>{t.name[0]}</div>}
        <div style={{ display: "grid", gap: 8 }}>
          <label className="fld">Photo (JPG, PNG or WebP, up to 3 MB)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></label>
          {t.photo && <label style={{ display: "flex", gap: 6, fontSize: 15.5 }}><input type="checkbox" name="remove_photo" /> Remove the photo</label>}
        </div>
      </div>
      <div className="eform">
        <label className="fld">Name<input name="name" required maxLength={80} defaultValue={t.name} /></label>
        <label className="fld">Email <span className="muted">(their sign-in and where emails go)</span><input name="email" type="email" maxLength={120} defaultValue={/\.example$/.test(t.email) ? "" : t.email} placeholder={t.email} style={{ width: 280 }} /></label>
        <label className="fld">Role shown on the website<input name="designation" maxLength={80} defaultValue={t.designation ?? ""} placeholder="e.g. Science Teacher" style={{ width: 280 }} /></label>
        <label className="fld">Web address<input name="slug" maxLength={60} defaultValue={t.slug ?? ""} /></label>
        <label className="fld">Order on the page<input name="sort" type="number" min={0} max={99} defaultValue={t.sort_order} style={{ width: 80 }} /></label>
      </div>
      <label className="fld">About (leave a blank line between paragraphs)<textarea name="bio" rows={12} maxLength={6000} defaultValue={t.bio ?? ""} className="mini" style={{ width: "100%" }} /></label>
      <label className="fld">Qualifications (one per line)<textarea name="qualifications" rows={5} maxLength={2000} defaultValue={t.qualifications.join("\n")} className="mini" style={{ width: "100%" }} /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="fld" style={{ marginBottom: 6 }}>Subjects they teach (used for 1:1 bookings)</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{subjects.map((s) => <label key={s.id} className="regopt"><input type="checkbox" name="subjects" value={s.id} defaultChecked={t.subjects.includes(s.id)} />{s.name}</label>)}</div></fieldset>
      <div><button className="abtn pri" type="submit">Save profile</button></div>
    </form>
    <form action={archiveTeacherAction} style={{ marginTop: 10 }}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="archive" value={t.archived ? "0" : "1"} />
      <button className="abtn sm" type="submit">{t.archived ? "Show on the website again" : "Hide from the website (e.g. when they leave)"}</button></form>
  </>;
}
