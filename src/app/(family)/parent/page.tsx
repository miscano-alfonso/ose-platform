import Link from "next/link";
import { requireParent } from "@/lib/family-auth";
import { kids, parentHome } from "@/lib/family";
import { Head, dm, gbp } from "../fmt";

export default async function ParentHome() {
  const f = await requireParent();
  const [ks, h] = await Promise.all([kids(f.id), parentHome(f.id)]);
  return <>
    <Head title={`Hello ${f.first}`} sub="Your children’s lessons, reports and payments" />
    <div className="dgrid"><div className="dstack">
      {ks.length === 0 && <section className="card"><p className="empty">No children on your account yet.</p></section>}
      {ks.map((st) => <section className="card" key={st.id} style={{ margin: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>{st.first}</h2>{st.level && <span className="pill mute">{st.level}</span>}
          {st.att != null && <span className={`pill ${st.att < 50 ? "warn" : "good"}`}>Attendance {st.att}%</span>}</div>
        <div style={{ marginTop: 8 }}>{st.classes.length === 0 ? <p className="empty">No courses this year.</p> : st.classes.map((c) => <div className="li" key={c.group_id}>
          <span className="dot" style={{ background: c.colour }} /><div className="t"><b>{c.subject}</b><span>{c.slots ?? "Times to follow"} · {c.teacher ?? "Teacher to be confirmed"}</span></div>
          {c.invited && <span className="pill warn">Classroom invitation not accepted</span>}</div>)}</div>
        {st.classes.some((c) => c.invited) && <p className="note" style={{ marginTop: 8 }}>{st.first} needs to accept the Google Classroom invitation sent to {st.email ?? "their Google account"} before joining these lessons.</p>}
      </section>)}
    </div><div className="dstack">
      <section className="card" style={{ margin: 0 }}><h2>Assignments</h2>
        {!h.classroomReady ? <p className="empty">Work set in Google Classroom shows here once the school connects it.</p> : ks.map((st) => { const w = h.work.find((x) => x.student_id === st.id);
          return <div className="li" key={st.id}><div className="t"><b>{st.first}</b><span>{w?.due ?? 0} due this week</span></div>{w?.overdue ? <span className="pill bad">{w.overdue} overdue</span> : <span className="pill good">Up to date</span>}</div>; })}
        <div style={{ marginTop: 10 }}><Link className="abtn sm" href="/parent/assignments">See assignments</Link></div></section>
      <section className="card" style={{ margin: 0 }}><h2>Next payment</h2>{h.next ? <><p style={{ font: "600 26px Jost, sans-serif", margin: "4px 0" }}>{gbp(h.next.amount)}</p><p className="note">on {dm(h.next.due)} from your saved card</p></> : <p className="empty">Nothing due.</p>}
        <div style={{ marginTop: 10 }}><Link className="abtn sm" href="/parent/payments">See all payments</Link></div></section>
      <section className="card" style={{ margin: 0 }}><h2>Reports</h2>{h.reports.length ? h.reports.map((r) => <div className="li" key={r.id}><div className="t"><b>{r.name}</b><span>{r.published ? dm(r.published) : ""}</span></div><Link className="abtn sm" href="/parent/reports">View</Link></div>) : <p className="empty">No reports yet.</p>}
        {h.upcoming && <p className="note" style={{ marginTop: 8 }}>The {h.upcoming.name} will be here on {dm(h.upcoming.publish_on)}.</p>}</section>
    </div></div>
  </>;
}
