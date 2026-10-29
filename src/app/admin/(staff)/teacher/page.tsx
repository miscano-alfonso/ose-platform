import { NotifyBell } from "../../../NotifyBell";
import Link from "next/link";
import { LessonClock, LessonCountdown } from "../../../LessonClock";
import { requireViewer } from "@/lib/auth";
import { myDay, teacherEmails, myChats, pointsGiven } from "@/lib/teacher-area";
import { teacherStream } from "@/lib/classroom-stream";
import { SlidesButton } from "./SlidesButton";
import { findSlides } from "@/lib/lesson-slides";
import { classesForPoints } from "@/lib/community";
import { listThreads } from "@/lib/community";
import { boardLayout } from "@/lib/dashboard-layout";
import { BOARD_MODULES } from "@/lib/dash-modules";
import { BentoBoard, type BoardModule } from "../../BentoBoard";
import { MoreList } from "../../MoreList";
import { Ring, Ico, IC } from "../../DashBits";
import { joinLabel } from "@/lib/video";

export const dynamic = "force-dynamic";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wd = (d: string) => DAY[((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7) + 1];
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });

// My day: the teacher's Bento dashboard: next lesson with Join up top, reports in lime, then the week.
export default async function MyDay() {
  const me = await requireViewer();
  const [d, threads, mail, chats, given, pclasses] = await Promise.all([myDay(me.id), listThreads(me.id, "open").catch(() => []), teacherEmails(me.id, 8),
    myChats(me.id).catch(() => []), pointsGiven(me.id).catch(() => []), classesForPoints(me.id, false).catch(() => [])]);
  const [stream, found] = await Promise.all([teacherStream(me.id).catch(() => ({ connected: false, linked: 0, items: [] })),
    findSlides(d.week.map((l) => ({ id: l.id, course: l.course_id ?? null, n: l.lesson_no ?? null, termStart: l.term_start ?? null, folder: l.slides_folder ?? null, term: l.term_no ?? null }))).catch(() => new Map())]);
  const top = [...new Map(pclasses.flatMap((c) => c.students.map((st) => [st.id, { name: st.name, pts: st.term_points }] as const))).values()].filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3);
  const today = new Date().toISOString().slice(0, 10);
  const next = d.week.find((l) => l.d > today || (l.d === today && l.status === "scheduled")) ?? d.week[0];
  const done = d.reportBars.reduce((a, r) => a + r.done, 0), total = d.reportBars.reduce((a, r) => a + r.total, 0);
  const rpct = total ? Math.round(done / total * 100) : null;
  const isToday = next?.d === today;
  const waiting = threads.filter((t) => t.last_sender === "parent").length;
  const modules: BoardModule[] = [
    { id: "hero", title: "Next lesson", node: <section className={`dx-hero c8${next ? " has-clock" : ""}`} data-lesson={next ? `${next.name}, ${next.time}` : undefined}><div className="fx-main">
        <p className="fx-live" style={isToday ? undefined : { color: "#c9cdea" }}>{isToday && <i />}{next ? (isToday ? "Today" : `Next lesson · ${wd(next.d)} ${dm(next.d)}`) : d.term?.name ?? "My day"}</p>
        <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hello</span> {me.name.split(" ")[0]}</span>{next && <><br />{next.name}</>}</h1>
        <div className="fx-sub-row"><p className="fx-hero-s">{next ? <>{next.students} student{next.students === 1 ? "" : "s"}{next.tasters.length ? ` · ${next.tasters.length} taster${next.tasters.length > 1 ? "s" : ""}` : ""}{next.absent.length ? ` · away: ${next.absent.join(", ")}` : ""}</> : "No lessons in the next 7 days."}</p>{next && <SlidesButton eventId={next.id} url={next.slides_url ?? null} found={found.get(next.id) ?? null} n={next.lesson_no} />}</div>
        {!!next?.birthdays?.length && <p className="fx-bday"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 1.2 1.5 2.1 1.5 2.8a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-2.8zM11.2 8h1.6v3h-1.6zM4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.2c-1.4 1.2-2.6 1.2-4 0-1.4 1.2-2.6 1.2-4 0-1.4 1.2-2.6 1.2-4 0-.7.6-1.3.9-2 .9zM4 17.5c.7 0 1.4-.2 2-.7 1.4 1.2 2.6 1.2 4 0 1.4 1.2 2.6 1.2 4 0 1.4 1.2 2.6 1.2 4 0 .6.5 1.3.7 2 .7V21H4z" fill="currentColor"/></svg>
          <span>{next.birthdays.map((b, i) => <span key={i}>{i ? (i === next.birthdays!.length - 1 ? " and " : ", ") : ""}<b>{b.name}</b>’s birthday {b.d === today ? "is today" : b.d === next.d ? "is on the lesson day" : `${b.d < today ? "was" : "is"} on ${wd(b.d)} ${dm(b.d)}`} (turns {b.age})</span>)}</span></p>}
        <div className="fx-btns">{next?.meet_url && <a className="go" href={next.meet_url} target="_blank" rel="noopener">{joinLabel(next.meet_url)}</a>}
          {next && <Link href={`/admin/register/${next.id}`}>Attendance</Link>}
          {next && <LessonCountdown date={next.d} time={next.time} withTime />}<NotifyBell settingsHref="/admin/teacher/notifications" />
</div>
      </div>{next && <div className="fx-side"><LessonClock date={next.d} time={next.time} /></div>}</section> },
    { id: "reports-pop", title: "Reports to write", node: <Link href="/admin/teacher/reports" className="dx-pop c4"><span>{d.reportCycle ?? "Reports"}</span>
        <b className="fx-big">{d.reportsLeft}</b>
        {total > 0 && <span className="fx-pop-prog"><span className="fx-pop-bar" role="img" aria-label={`${rpct}% of reports written`}><i style={{ width: `${rpct}%` }} /></span><small>{done} of {total} written · {rpct}%</small></span>}
        <span>{d.reportsLeft ? `comment${d.reportsLeft === 1 ? "" : "s"} to write${d.reportsDue ? ` · due ${dm(d.reportsDue)}` : ""} →` : "Nothing to write right now →"}</span></Link> },
    { id: "k-attendance", title: "Attendance in my classes", node: <div className="dx-kpi ring c3"><div><span className="k">Attendance in my classes</span><span className="v">{d.attendance == null ? "–" : `${d.attendance}%`}</span><span className="h">this term</span></div><Ring pct={d.attendance} tone={d.attendance == null ? "brand" : d.attendance < 50 ? "bad" : d.attendance < 80 ? "warn" : "good"} /></div> },
    { id: "k-reports", title: "Reports written", node: <div className="dx-kpi ring c3"><div><span className="k">Reports written</span><span className="v">{rpct == null ? "–" : `${rpct}%`}</span><span className="h">{total ? `${done} of ${total}` : "none open"}</span></div><Ring pct={rpct} /></div> },
    { id: "k-ones", title: "1:1s this week", node: <Link href="/admin/teacher/ones" className="dx-kpi c3"><Ico d={IC.users} /><span className="k">1:1s this week</span><span className="v">{d.onesThisWeek}</span><span className="h">See 1:1s →</span></Link> },
    { id: "k-pay", title: "My pay this term", node: <Link href="/admin/teacher/pay" className="dx-kpi c3"><Ico d={IC.pound} /><span className="k">My pay this term</span><span className="v">{gbp(d.payThisTerm)}</span><span className="h">{d.term ? `paid ${dm(d.term.pay_date)}` : ""}</span></Link> },
    { id: "week", title: "This week", node: <section className="dx-card c7 dx-tall"><header><h2>This week</h2><Link className="dx-more" href="/admin/teacher/timetable">Timetable →</Link></header>
        {d.week.length === 0 ? <p className="empty">No lessons coming up.</p> : <div className="dx-scroll">{d.week.map((l) => <div className="fx-row" key={l.id}>
          <span className="fx-when">{wd(l.d)} {dm(l.d)}</span>
          <div className="t"><b>{l.time} · {l.name}</b><span>{l.students} student{l.students === 1 ? "" : "s"}
            {l.not_in_classroom ? ` · ${l.not_in_classroom} not in Classroom yet` : ""}
            {l.tasters.length ? ` · ${l.tasters.length} taster${l.tasters.length > 1 ? "s" : ""}: ${l.tasters.join(", ")}` : ""}
            {l.absent.length ? ` · away: ${l.absent.join(", ")}` : ""}</span></div>
          {l.id !== next?.id && <SlidesButton compact eventId={l.id} url={l.slides_url ?? null} found={found.get(l.id) ?? null} />}
          {l.d < today || l.status !== "scheduled" ? <Link className="abtn sm" href={`/admin/register/${l.id}`}>Attendance</Link>
            : l.meet_url ? null // the next lesson's Join button is at the top
            : <span className="pill mute" title="The office adds the Meet link to the class">No Meet link</span>}
        </div>)}</div>}
      </section> },
    { id: "reports", title: "Reports progress", node: <section className="dx-card c5 dx-tall"><header><h2>{d.reportCycle ?? "Reports"}</h2><Link className="dx-more" href="/admin/teacher/reports">Write →</Link></header>
        {d.reportBars.length === 0 ? <p className="empty">No reports to write right now.</p> : <div className="bars">{d.reportBars.map((r) => <div className="brow" key={r.group_id}>
          <span className="lbl">{r.name}</span><div className="track"><i style={{ width: `${r.total ? r.done / r.total * 100 : 0}%` }} /></div><span className="num">{r.done}/{r.total}</span></div>)}</div>}
      </section> },
    { id: "messages", title: "Messages", size: "l", node: <section className="dx-card dx-tall"><header><h2>Messages</h2>{waiting > 0 && <span className="dx-count">{waiting}</span>}<Link className="dx-more" href="/admin/teacher/messages">All messages →</Link></header>
      {threads.length === 0 ? <div className="dx-clear"><Ico d={IC.check} /><b>No open conversations</b><span>Parents’ messages to you show here.</span></div>
        : <MoreList className="dx-list" limit={4}>{threads.map((t) => <Link key={t.id} className={`dx-item ${t.last_sender === "parent" ? "warn" : "info"}`} href={`/admin/messages/${t.id}`}>
          <span className="t">{t.last_sender === "parent" && <span className="pill warn">Waiting for your reply</span>}<b>{t.subject}</b><span>{t.parent} · about {t.student} · {dm(t.last_message_at.slice(0, 10))}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</MoreList>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><Link className="abtn sm" href="/admin/messages/new">New message</Link></div>
    </section> },
    { id: "email", title: "Email", size: "l", node: <section className="dx-card dx-tall"><header><h2>Email</h2><span className="dx-sub">with the school</span><Link className="dx-more" href="/admin/teacher/email">All email →</Link></header>
      {mail.length === 0 ? <div className="dx-clear"><Ico d={IC.check} /><b>No emails yet</b><span>Email the school (the office) from here. Parents use Messages.</span></div>
        : <MoreList className="dx-list" limit={4}>{mail.map((e) => <Link key={e.id} className={`dx-item ${e.replied_at ? "good" : "info"}`} href={`/admin/teacher/email#e-${e.id}`}>
          <span className="t">{e.replied_at ? <span className="pill good">Replied</span> : <span className="pill mute">Sent</span>}<b>{e.subject || "(no subject)"}</b>
            <span>{(e.reply_body ?? e.body).length > 110 ? (e.reply_body ?? e.body).slice(0, 110) + "…" : (e.reply_body ?? e.body)}</span><span style={{ fontSize: 13 }}>{dm((e.replied_at ?? e.at).slice(0, 10))}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</MoreList>}
      <div style={{ marginTop: 12 }}><Link className="abtn sm" href="/admin/teacher/email?new=1">Email the school</Link></div>
    </section> },
    { id: "chats", title: "Class chats", size: "l", node: <section className="dx-card"><header><h2>Class chats</h2><Link className="dx-more" href="/admin/teacher/chats">All chats →</Link></header>
      {chats.length === 0 ? <p className="empty">You have no classes this year.</p>
        : <MoreList className="dx-list" limit={5}>{[...chats].sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? "")).map((c) => <Link key={c.id} className="dx-item info" href={`/admin/teacher/chats?c=${c.id}`}>
          <span className="t"><b>{c.name}</b><span>{c.messages} message{c.messages === 1 ? "" : "s"}{c.last_at ? ` · last ${dm(c.last_at.slice(0, 10))}` : ""}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</MoreList>}
    </section> },
    { id: "rewards", title: "Reward points", size: "l", node: <section className="dx-card"><header><h2>Reward points</h2><Link className="dx-more" href="/admin/points">Give points →</Link></header>
      {top.length > 0 && <div className="dx-chips" style={{ marginBottom: 10 }}>{top.map((t, i) => <span key={i} className="pill good">{i + 1}. {t.name} · {t.pts}</span>)}</div>}
      {given.length === 0 ? <p className="empty">You haven’t given any points yet. Reward great work with 1–10 points.</p>
        : <MoreList className="dx-list" limit={4}>{given.map((p) => <div key={p.id} className="dx-item good"><span className="t"><b>+{p.points} · {p.student}</b><span>{p.reason} · {p.class} · {dm(p.awarded_on)}</span></span></div>)}</MoreList>}
      <div style={{ marginTop: 12 }}><Link className="abtn sm" href="/admin/points">Give points</Link></div>
    </section> },
    { id: "stream", title: "Classroom stream", size: "l", node: <section className="dx-card"><header><h2>Classroom stream</h2><a className="dx-more" href="https://classroom.google.com/" target="_blank" rel="noopener">Classroom →</a></header>
      {stream.linked === 0 ? <p className="empty">None of your classes is linked to a Google Classroom course yet. The office links them.</p>
        : !stream.connected ? <p className="empty">The Classroom stream shows here once the office connects the recordings account.</p>
        : stream.items.length === 0 ? <p className="empty">No posts in your Classroom courses yet.</p>
        : <MoreList className="dx-list" limit={5}>{stream.items.map((it) => { const inner = <><span className="t"><span className={`pill ${it.kind === "work" ? "warn" : it.kind === "material" ? "info" : "mute"}`}>{it.kind === "work" ? "Assignment" : it.kind === "material" ? "Material" : "Post"}</span>
            <b>{it.title || "(no title)"}</b>{it.text && <span>{it.text.length > 120 ? it.text.slice(0, 120) + "…" : it.text}</span>}<span style={{ fontSize: 13 }}>{it.course}{it.at ? ` · ${dm(it.at.slice(0, 10))}` : ""}</span></span>{it.link && <span className="go" aria-hidden="true">→</span>}</>;
          return it.link ? <a key={it.id} className="dx-item info" href={it.link} target="_blank" rel="noopener" style={it.colour ? { borderLeftColor: it.colour } : undefined}>{inner}</a> : <div key={it.id} className="dx-item info">{inner}</div>; })}</MoreList>}
    </section> },
  ];
  const known = BOARD_MODULES["teacher-home"];
  const b = await boardLayout("teacher-home", null, known, BUILT_IN);
  return <div className="fx fx-board">
    <BentoBoard page="teacher-home" modules={modules} layout={b.layout} defaults={BUILT_IN}
      saved={b.std} scope="standard" locked={!me.viewing || b.mirrored} audience="teachers" />
  </div>;
}

const BUILT_IN: { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full"; h?: "s" | "m" | "l" }[] = [
  { id: "hero", size: "xl" }, { id: "reports-pop", size: "m" },
  { id: "k-attendance", size: "m" }, { id: "k-ones", size: "m" }, { id: "k-pay", size: "m" },
  { id: "week", size: "l", h: "m" }, { id: "reports", size: "l", h: "m" }, { id: "messages", size: "l", h: "m" }, { id: "email", size: "l", h: "m" },
];
