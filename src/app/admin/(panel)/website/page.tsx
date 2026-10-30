import Link from "next/link";
import { siteText, getFaqs, DEFAULTS, listCoursePages } from "@/lib/site-content";
import { saveSiteTextAction, saveFaqAction, deleteFaqAction, saveBrandAction, resetBrandAction } from "../../actions";
import { brandSrc } from "@/lib/brand";

export default async function Website({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [txt, faqs, pages, brand] = await Promise.all([siteText(), getFaqs(true), listCoursePages(), brandSrc()]);
  return <>
    <div className="top"><div><h1>Website</h1><div className="sub">Change the text on the website. Saved changes show straight away.</div></div><span className="grow" /><a className="abtn sm" href="/" target="_blank" rel="noreferrer">View the website</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    {sp.err && <p className="note msg err">{sp.err}</p>}
    <section className="card" id="brand"><h2>Logo and browser icon</h2>
      <div className="brand-grid">
        <div className="brand-box">
          <div className="brand-prev"><img src={brand.logo} alt="Current logo" /></div>
          <p className="muted">Shown in the website menu, the admin and the login page, always on navy, so a white or light logo with a transparent background works best. PNG, SVG, WebP or JPG, up to 1 MB.</p>
          <form action={saveBrandAction} className="eform"><input type="hidden" name="kind" value="logo" />
            <input type="file" name="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" required />
            <button className="abtn pri" type="submit">Upload logo</button></form>
          {brand.custom.logo && <form action={resetBrandAction}><input type="hidden" name="kind" value="logo" /><button className="abtn sm" type="submit">Go back to the original logo</button></form>}
        </div>
        <div className="brand-box">
          <div className="brand-icons"><span className="tabmock"><img src={brand.icon} alt="Current browser icon" width={16} height={16} />OH-SO ED</span><img src={brand.icon} alt="" width={64} height={64} className="brand-big" /></div>
          <p className="muted">The small picture in the browser tab and on phone home screens. Use a square image, at least 180 × 180 pixels. PNG or SVG, up to 512 KB.</p>
          <form action={saveBrandAction} className="eform"><input type="hidden" name="kind" value="icon" />
            <input type="file" name="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" required />
            <button className="abtn pri" type="submit">Upload icon</button></form>
          {brand.custom.icon && <form action={resetBrandAction}><input type="hidden" name="kind" value="icon" /><button className="abtn sm" type="submit">Go back to the original icon</button></form>}
        </div>
      </div>
    </section>
    <form action={saveSiteTextAction} className="card" style={{ display: "grid", gap: 12 }}>
      <h2>Homepage</h2>
      <label className="fld">Small heading<input name="home_eyebrow" maxLength={120} defaultValue={txt.home_eyebrow} style={{ maxWidth: 560 }} /></label>
      <label className="fld">Main heading <span className="muted">(each line here is a line on the homepage)</span><textarea name="home_title" rows={3} maxLength={160} defaultValue={txt.home_title} style={{ maxWidth: 560 }} /></label>
      <label className="fld">Introduction<textarea name="home_lead" rows={4} maxLength={800} defaultValue={txt.home_lead} className="mini" style={{ width: "100%" }} /></label>
      <label className="fld">Yellow ticker (one message per line)<textarea name="ticker" rows={4} maxLength={600} defaultValue={txt.ticker} className="mini" style={{ width: "100%", maxWidth: 560 }} /></label>
      <h2 style={{ marginTop: 8 }}>Teachers page</h2>
      <label className="fld">Introduction<input name="teachers_intro" maxLength={300} defaultValue={txt.teachers_intro} style={{ maxWidth: 720 }} /></label>
      <label className="fld">“Teach with us” heading (under the teachers)<input name="teach_title" maxLength={120} defaultValue={txt.teach_title} style={{ maxWidth: 520 }} /></label>
      <label className="fld">“Teach with us” text<textarea name="teach_text" rows={3} maxLength={600} defaultValue={txt.teach_text} className="mini" style={{ width: "100%", maxWidth: 720 }} /></label>
      <label className="fld">“Teach with us” button (goes to Jobs)<input name="teach_button" maxLength={60} defaultValue={txt.teach_button} style={{ maxWidth: 360 }} /></label>
      <h2 style={{ marginTop: 8 }}>Homepage: Meet the Headteacher</h2>
      <label className="fld">Heading<input name="head_title" maxLength={80} defaultValue={txt.head_title} style={{ maxWidth: 420 }} /></label>
      <label className="fld">Text (each line is a paragraph)<textarea name="head_text" rows={6} maxLength={1000} defaultValue={txt.head_text} className="mini" style={{ width: "100%" }} /></label>
      <h2 style={{ marginTop: 8 }}>About page</h2>
      <label className="fld">Heading<input name="about_title" maxLength={80} defaultValue={txt.about_title} style={{ maxWidth: 420 }} /></label>
      <label className="fld">Text (each line is a paragraph)<textarea name="about_text" rows={10} maxLength={4000} defaultValue={txt.about_text} className="mini" style={{ width: "100%" }} /></label>
      <h2 style={{ marginTop: 8 }}>Homepage: Facebook reviews</h2>
      <div className="eform"><input type="hidden" name="reviews_rating" value={txt.reviews_rating} /><input type="hidden" name="reviews_count" value={txt.reviews_count} />
        <label className="fld">Facebook reviews link<input name="reviews_url" type="url" maxLength={300} defaultValue={txt.reviews_url} style={{ width: 360 }} /></label>
        <label className="fld">Elfsight widget ID<input name="reviews_widget" maxLength={60} defaultValue={txt.reviews_widget} style={{ width: 330 }} /></label></div>
      <p className="note" style={{ margin: 0 }}>The rating, stars and reviews come from the Elfsight widget. Its own title is hidden, and its button opens the reviews link above.</p>
      <div><button className="abtn pri" type="submit">Save</button> <span className="muted" style={{ fontSize: 14 }}>Clear a box to go back to the original text.</span></div>
      <input type="hidden" name="keys" value={Object.keys(DEFAULTS).join(",")} />
    </form>

    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Course pages ({pages.length})</h2>
    <div className="tw"><table><thead><tr><th>Course</th><th>Topics</th><th>Exam board</th><th>Sample lesson</th><th></th></tr></thead>
      <tbody>{pages.map((c) => <tr key={c.id}><td><b>{c.level} {c.subject}</b>{!c.published && <> <span className="pill mute">Hidden</span></>}</td><td>{c.topics.length}</td><td>{c.exam_board ?? "—"}</td><td>{!c.video ? <span className="muted">None</span> : c.video.includes("ohsoed.co.uk/uploads") ? <span className="pill warn">On the old site</span> : <span className="pill good">Yes</span>}</td>
        <td><div className="acts"><Link className="abtn sm" href={`/admin/website/courses/${c.id}`}>Edit</Link><a className="abtn sm" href={`/courses/${c.slug}`} target="_blank" rel="noreferrer">View</a></div></td></tr>)}</tbody></table></div>

    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>FAQs ({faqs.length})</h2>
    <p className="note" style={{ marginTop: -4 }}>Lines starting with “- ” show as bullet points. Lower numbers come first.</p>
    {faqs.map((f) => <details className="card" key={f.id} style={{ padding: "10px 16px" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{f.question}{!f.published && <> <span className="pill mute">Hidden</span></>}</summary>
      <FaqForm id={f.id} q={f.question} a={f.answer} sort={f.sort_order} published={f.published} />
      <form action={deleteFaqAction} style={{ marginTop: 8 }}><input type="hidden" name="id" value={f.id} /><button className="abtn sm" type="submit">Delete this question</button></form></details>)}
    <section className="card"><h2>Add a question</h2><FaqForm id="" q="" a="" sort={(faqs.at(-1)?.sort_order ?? 0) + 10} published /></section>
  </>;
}
function FaqForm({ id, q, a, sort, published }: { id: string; q: string; a: string; sort: number; published: boolean }) {
  return <form action={saveFaqAction} style={{ display: "grid", gap: 10, marginTop: 10 }}>
    <input type="hidden" name="id" value={id} />
    <label className="fld">Question<input name="question" required maxLength={300} defaultValue={q} style={{ maxWidth: 720 }} /></label>
    <label className="fld">Answer<textarea name="answer" required rows={5} maxLength={5000} defaultValue={a} className="mini" style={{ width: "100%" }} /></label>
    <div className="eform"><label className="fld">Order<input name="sort" type="number" defaultValue={sort} style={{ width: 90 }} /></label>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="published" defaultChecked={published} /> Show on the website</label>
      <button className="abtn" type="submit">{id ? "Save" : "Add"}</button></div>
  </form>;
}
