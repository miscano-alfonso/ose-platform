import Link from "next/link";
import { siteText, getFaqs, DEFAULTS, listCoursePages } from "@/lib/site-content";
import { saveSiteTextAction, saveFaqAction, deleteFaqAction } from "../../actions";

export default async function Website({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams;
  const [txt, faqs, pages] = await Promise.all([siteText(), getFaqs(true), listCoursePages()]);
  return <>
    <div className="top"><div><h1>Website</h1><div className="sub">Change the text on the website. Saved changes show straight away.</div></div><span className="grow" /><a className="abtn sm" href="/" target="_blank" rel="noreferrer">View the website</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <form action={saveSiteTextAction} className="card" style={{ display: "grid", gap: 12 }}>
      <h2>Homepage</h2>
      <label className="fld">Small heading<input name="home_eyebrow" maxLength={120} defaultValue={txt.home_eyebrow} style={{ maxWidth: 560 }} /></label>
      <label className="fld">Main heading<input name="home_title" maxLength={160} defaultValue={txt.home_title} style={{ maxWidth: 560 }} /></label>
      <label className="fld">Introduction<textarea name="home_lead" rows={4} maxLength={800} defaultValue={txt.home_lead} className="mini" style={{ width: "100%" }} /></label>
      <label className="fld">Yellow ticker (one message per line)<textarea name="ticker" rows={4} maxLength={600} defaultValue={txt.ticker} className="mini" style={{ width: "100%", maxWidth: 560 }} /></label>
      <h2 style={{ marginTop: 8 }}>Teachers page</h2>
      <label className="fld">Introduction<input name="teachers_intro" maxLength={300} defaultValue={txt.teachers_intro} style={{ maxWidth: 720 }} /></label>
      <div><button className="abtn pri" type="submit">Save</button> <span className="muted" style={{ fontSize: 14 }}>Clear a box to go back to the original text.</span></div>
      <input type="hidden" name="keys" value={Object.keys(DEFAULTS).join(",")} />
    </form>

    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Course pages ({pages.length})</h2>
    <div className="tw"><table><thead><tr><th>Course</th><th>Topics</th><th>Exam board</th><th></th></tr></thead>
      <tbody>{pages.map((c) => <tr key={c.id}><td><b>{c.level} {c.subject}</b>{!c.published && <> <span className="pill mute">Hidden</span></>}</td><td>{c.topics.length}</td><td>{c.exam_board ?? "—"}</td>
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
