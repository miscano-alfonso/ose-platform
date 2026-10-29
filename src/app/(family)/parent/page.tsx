import Link from "next/link";
import { LessonClock, LessonCountdown } from "../../LessonClock";
import { requireParent } from "@/lib/family-auth";
import { kids, parentHome, parentAttendance, parentThreads } from "@/lib/family";
import { boardLayout } from "@/lib/dashboard-layout";
import { BOARD_MODULES } from "@/lib/dash-modules";
import { BentoBoard, type BoardModule } from "../../admin/BentoBoard";
import { dm, dlong, gbp } from "../fmt";
import { Ring } from "../../admin/DashBits";

// The parent's home, Bento style: the family's next lesson up top (with Report an absence), the next payment in lime,
// a card per child with their attendance ring and classes, then work due and reports.
export default async function ParentHome() {
  const f = await requireParent();
  const [ks, h, a, threads] = await Promise.all([kids(f.id), parentHome(f.id), parentAttendance(f.id), parentThreads(f.id).catch(() => [])]);
  const next = a.upcoming.find((u) => !u.absent) ?? null, who = next ? ks.find((k) => k.id === next.student_id) : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const tone = (p: number | null) => p == null ? "brand" : p < 50 ? "bad" : p < 80 ? "warn" : "good";
  const unread = threads.filter((t) => t.unread).length;
  const modules: BoardModule[] = [
    { id: "hero", title: "Next lesson", node: <section className={`dx-hero c8${next ? " has-clock" : ""}`}><div className="fx-main">
        <p className="fx-live" style={next?.date === today ? undefined : { color: "#c9cdea" }}>{next?.date === today && <i />}{next ? (next.date === today ? "Today" : `Next lesson · ${dlong(next.date)}`) : "Your account"}</p>
        <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hello</span> {f.first}</span>{next && <><br />{who?.first ?? ""}: {next.class}</>}</h1>
        <p className="fx-hero-s">{next ? `${dlong(next.date)} · ${next.time}` : ks.length ? "No lessons in the next four weeks." : "No children on your account yet."}</p>
        <div className="fx-btns"><Link className="go" href="/parent/attendance">Report an absence</Link><Link href="/parent/messages">Message a teacher</Link>
          {next && <LessonCountdown date={next.date} time={next.time} />}</div>
      </div>{next && <LessonClock date={next.date} time={next.time} />}</section> },
    { id: "payment", title: "Next payment", node: <Link href="/parent/payments" className="dx-pop c4"><span>Next payment</span>
        <b className="fx-big">{h.next ? gbp(h.next.amount) : "£0"}</b><span>{h.next ? `on ${dm(h.next.due)} from your saved card →` : "Nothing due →"}</span></Link> },
    { id: "children", title: "Your children", size: "full", node: <div className="fx-kids">{ks.map((st) => <section className="dx-card c6" key={st.id}>
        <div className="fx-kid"><Ring pct={st.att} tone={tone(st.att)} /><div><h2>{st.first}</h2><span className="muted" style={{ fontSize: 14.5 }}>{st.level || "No level yet"} · {st.att == null ? "attendance shows after the first lesson" : `${st.att}% attendance this term`}</span></div></div>
        {st.classes.length === 0 ? <p className="empty">No courses this year.</p> : st.classes.map((c) => <div className="fx-row" key={c.group_id}>
          <span className="dot" style={{ background: c.colour }} /><div className="t"><b>{c.subject}</b><span>{c.slots ?? "Times to follow"} · {c.teacher ?? "Teacher to be confirmed"}</span></div>
          {c.invited && <span className="pill warn">Invitation not accepted</span>}</div>)}
        {st.classes.some((c) => c.invited) && <p className="note" style={{ marginTop: 8 }}>{st.first} needs to accept the Google Classroom invitation sent to {st.email ?? "their Google account"} before joining these lessons.</p>}
      </section>)}</div> },
    { id: "work", title: "Work due", node: <section className="dx-card c6"><header><h2>Work due</h2><Link className="dx-more" href="/parent/assignments">Assignments →</Link></header>
        {!h.classroomReady ? <p className="empty">Work set in Google Classroom shows here once the school connects it.</p> : ks.map((st) => { const w = h.work.find((x) => x.student_id === st.id);
          return <div className="fx-row" key={st.id}><div className="t"><b>{st.first}</b><span>{w?.due ?? 0} due this week</span></div>{w?.overdue ? <span className="pill bad">{w.overdue} overdue</span> : <span className="pill good">Up to date</span>}</div>; })}</section> },
    { id: "reports", title: "Reports", node: <section className="dx-card c6"><header><h2>Reports</h2><Link className="dx-more" href="/parent/reports">All reports →</Link></header>
        {h.reports.length ? h.reports.map((r) => <div className="fx-row" key={r.id}><div className="t"><b>{r.name}</b><span>{r.published ? dm(r.published) : ""}</span></div><Link className="abtn sm" href="/parent/reports">View</Link></div>) : <p className="empty">No reports yet.</p>}
        {h.upcoming && <p className="note" style={{ marginTop: 8 }}>The {h.upcoming.name} will be here on {dm(h.upcoming.publish_on)}.</p>}</section> },
    { id: "coming", title: "Coming up", size: "l", node: <section className="dx-card c6"><header><h2>Coming up</h2><Link className="dx-more" href="/parent/attendance">Attendance →</Link></header>
        {a.upcoming.slice(0, 5).map((u) => <div className="fx-row" key={u.id + u.student_id}><span className="fx-when">{dlong(u.date)}</span><div className="t"><b>{ks.find((k) => k.id === u.student_id)?.first}: {u.class}</b><span>{u.time}</span></div>{u.absent && <span className="pill mute">Away</span>}</div>)}</section> },
    { id: "messages", title: "Messages", size: "l", node: <section className="dx-card"><header><h2>Messages</h2>{unread > 0 && <span className="dx-count">{unread}</span>}<Link className="dx-more" href="/parent/messages">All messages →</Link></header>
      {threads.length === 0 ? <p className="empty">No messages yet. You can message your children’s teachers.</p> : threads.slice(0, 4).map((t) => <div className="fx-row" key={t.id}><div className="t"><b>{t.subject}</b><span>{t.teacher} · about {t.student} · {dm(t.last_at)}</span></div>
        {t.unread ? <span className="pill info">New</span> : null}<Link className="abtn sm" href={`/parent/messages?t=${t.id}`}>Open</Link></div>)}
      <div style={{ marginTop: 10 }}><Link className="abtn sm" href="/parent/messages?new=1">New message</Link></div></section> },
  ];
  const b = await boardLayout("parent-home", null, BOARD_MODULES["parent-home"], BUILT_IN);
  return <div className="fx fx-board">
    <BentoBoard page="parent-home" modules={modules.filter((m) => m.id !== "coming" || a.upcoming.length > 1)} layout={b.layout} defaults={BUILT_IN}
      saved={b.std} scope="standard" locked={!f.viewer || b.mirrored} audience="parents" />
  </div>;
}

const BUILT_IN: { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full" }[] = [
  { id: "hero", size: "xl" }, { id: "payment", size: "m" }, { id: "children", size: "full" },
  { id: "work", size: "l" }, { id: "reports", size: "l" }, { id: "coming", size: "l" }, { id: "messages", size: "l" },
];
