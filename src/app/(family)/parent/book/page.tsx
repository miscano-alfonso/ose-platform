import { requireParent } from "@/lib/family-auth";
import { tutoringChoices } from "@/lib/family";
import { openTimes } from "@/lib/tutoring";
import { requestOneAction } from "../../actions";
import { Head, Flash, dlong, hm, gbp } from "../../fmt";

export default async function Book({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; o?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const c = await tutoringChoices(f.id);
  const opt = c.options[Number(sp.o) || 0];
  const times = opt ? (await openTimes(opt.level_id, opt.subject_id)).filter((t) => Date.parse(t.starts_at) < Date.now() + 15 * 864e5) : [];
  const days = [...new Set(times.map((t) => t.starts_at.slice(0, 10)))];
  return <>
    <Head title="Book a 1:1" sub={`One-to-one lessons with our teachers${c.price ? `, from ${gbp(c.price)} for 45 minutes as an enrolled family` : ""}`} />
    <Flash sp={sp} />
    <div className="dgrid"><section className="card" style={{ margin: 0 }}>
      {c.options.length === 0 ? <p className="empty">1:1s are for children enrolled on a course.</p> : <>
        <div className="segl" style={{ flexWrap: "wrap" }}>{c.options.map((o, i) => <a key={i} href={`/parent/book?o=${i}`} aria-current={o === opt ? "true" : undefined}>{o.first} · {o.subject}</a>)}</div>
        <h3 style={{ margin: "14px 0 8px", font: "600 16px Jost, sans-serif" }}>Choose a time · next 2 weeks</h3>
        {times.length === 0 ? <p className="empty">No times free in the next two weeks. Send us a message and we’ll find one.</p> :
        <form action={requestOneAction} style={{ display: "grid", gap: 12 }}><input type="hidden" name="student" value={opt.student_id} /><input type="hidden" name="subject" value={opt.subject_id} />
          {days.map((d) => <div key={d}><div className="note" style={{ marginBottom: 4 }}><b>{dlong(d)}</b></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{times.filter((t) => t.starts_at.slice(0, 10) === d).map((t) => <label key={t.teacher_id + t.starts_at} className="abtn sm" style={{ gap: 6 }}>
              <input type="radio" name="slot" value={`${t.teacher_id}|${t.starts_at}`} required /> {hm(t.starts_at)} · {t.teacher.split(" ")[0]}</label>)}</div></div>)}
          <label className="fld">What would {opt.first} like help with?<textarea name="focus" rows={3} maxLength={300} className="mini" style={{ width: "100%" }} placeholder="e.g. fractions before next week’s test" /></label>
          <div><button className="abtn pri" type="submit">Request this time</button></div>
          <p className="note" style={{ margin: 0 }}>We’ll confirm by email and take payment then. Free to cancel up to 24 hours before. The Google Meet invitation goes to {opt.first}’s Google account.</p>
        </form>}</>}
    </section>
    <section className="card" style={{ margin: 0 }}><h2>Your 1:1s</h2>{c.booked.length === 0 ? <p className="empty">None booked yet.</p> : c.booked.map((b) => <div className="li" key={b.id}>
      <div className="t"><b>{dlong(b.at)} {hm(b.at)} · {b.subject}</b><span>{b.child.split(" ")[0]} with {b.teacher}{b.focus ? ` · “${b.focus}”` : ""}</span></div>
      <span className={`pill ${b.status === "completed" ? "good" : "info"}`}>{b.status === "completed" ? "Done" : "Booked"}</span></div>)}</section></div>
  </>;
}
