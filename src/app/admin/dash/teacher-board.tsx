import { NotifyBell } from "../../NotifyBell";
import Link from "next/link";
import { LessonClock, LessonLinkButton, RefreshAt } from "../../LessonClock";
import { myDay, teacherEmails, myChats, pointsGiven } from "@/lib/teacher-area";
import { teacherStream } from "@/lib/classroom-stream";
import { SlidesButton } from "../(staff)/teacher/SlidesButton";
import { findSlides } from "@/lib/lesson-slides";
import { classesForPoints } from "@/lib/community";
import type { BoardModule } from "../BentoBoard";
import { studentOverview } from "@/lib/student-overview";
import { MoreList } from "../MoreList";
import { NavCountSync } from "../NavCountSync";
import { Ring, Ico, IC } from "../DashBits";
import { joinLabel } from "@/lib/video";
import { markingQueue, countdown, tone, TURNAROUND_DAYS, REMIND_DAYS } from "@/lib/marking";


const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wd = (d: string) => DAY[((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7) + 1];
const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
/** A Postgres or ISO timestamp as "26 Nov" (London). */
const onDay = (s: string) => { const t = Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")); return isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }); };
/** "Tue 1 Dec · 16:00" (London) from a Postgres or ISO timestamp. */
const whenOne = (s: string) => { const t = Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")); if (isNaN(t)) return "";
  const d = new Date(t), o = { timeZone: "Europe/London" } as const;
  return `${d.toLocaleDateString("en-GB", { ...o, weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-GB", { ...o, hour: "2-digit", minute: "2-digit" })}`; };
const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** My day's modules: the teacher's next lesson with Join up top, reports, then the week (also used by the Solo dashboard). */
export async function teacherModules(me: { id: string; name: string }): Promise<BoardModule[]> {
  // 26 Nov: everything My day needs is looked up at the same time (it used to be eight steps one after another), then the
  // slides for this week's lessons, which need the week. Google Classroom is re-read in the background (classroom-stream /
  // lesson-slides), so a teacher never waits for Google.
  const inboxP = import("@/lib/teacher-inbox").then(async (m) => {   // the same one inbox as the Messages page (the office, the school, families)
    const ta = await import("@/lib/teacher-area");
    const [contacts, office] = await Promise.all([ta.teacherContacts().catch(() => []), ta.officeInfo().catch(() => ({ label: "the office" }))]);
    return (await m.teacherInbox(me.id, office.label, contacts)).items;
  }).catch(() => []);
  const onesP = import("@/lib/teacher-area").then((t) => t.upcomingOnes(me.id)).catch(() => []);   // started alongside the rest
  const [fromOffice, inbox, d, mail, chats, given, pclasses, stream, so, marking, familyOn] = await Promise.all([
    import("@/lib/office-messages").then((o) => o.myOfficeThreads("teacher", me.id)).catch(() => []),   // messages the office started, for The school
    inboxP, myDay(me.id), teacherEmails(me.id, 8),
    myChats(me.id).catch(() => []), pointsGiven(me.id).catch(() => []), classesForPoints(me.id, false).catch(() => []),
    teacherStream(me.id).catch(() => ({ connected: false, linked: 0, items: [] })),
    studentOverview({ teacherUserId: me.id }).catch(() => null),   // 5 Nov: students behind on their Classroom work
    markingQueue(me.id).catch(() => []),   // 6 Nov: handed-in work to mark and return within 7 days
    import("@/lib/teacher-area").then((t) => t.familyMsgsOn()).catch(() => false)]);
  const ones = await onesP;
  const found = await findSlides(d.week.map((l) => ({ id: l.id, course: l.course_id ?? null, n: l.lesson_no ?? null, termStart: l.term_start ?? null, folder: l.slides_folder ?? null, term: l.term_no ?? null }))).catch(() => new Map());
  const unreadN = inbox.filter((i) => i.unread > 0).length;
  const inboxSorted = [...inbox].sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0));   // unread on top, then newest
  const top = [...new Map(pclasses.flatMap((c) => c.students.map((st) => [st.id, { name: st.name, pts: st.term_points }] as const))).values()].filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });   // London's date (26 Nov: was UTC's)
  const next = d.week[0];   // 2 Nov: My day only holds lessons that haven’t ended yet, so the first is the next one
  const done = d.reportBars.reduce((a, r) => a + r.done, 0), total = d.reportBars.reduce((a, r) => a + r.total, 0);
  const rpct = total ? Math.round(done / total * 100) : null;
  const isToday = next?.d === today;
  // 26 Nov: "Term 2 · Week 4 · Thursday 26 Nov · 13:00" (the day's name, with the live dot, for a lesson today): the term and week of the term the next lesson falls in (weeks count Monday to Sunday)
  const monday = (x: string) => { const t = new Date(x + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.getTime(); };
  const termWeek = next?.term_no && next.term_start ? `Term ${next.term_no} · Week ${Math.floor((monday(next.d) - monday(next.term_start)) / 6048e5) + 1}` : next && d.term?.name ? d.term.name : "";
  const behind = so ? so.rows.filter((r) => r.missing > 0).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)) : [];
  const urgent = marking.filter((m) => m.daysLeft <= REMIND_DAYS).length;
  const dueDay = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  const modules: BoardModule[] = [
    { id: "hero", title: "Next lesson", node: <section className={`dx-hero c8${next ? " has-clock" : ""}`} data-lesson={next ? `${next.name}, ${next.time}` : undefined}><div className="fx-main">{next && <RefreshAt at={next.ends_at} />}
        <p className="fx-live">{isToday && <i />}{termWeek ? `${termWeek} · ` : ""}{next ? (isToday ? `${new Date(next.d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })} ${dm(next.d)} · ${next.time.slice(0, 5)}` : `${wd(next.d)} ${dm(next.d)} · ${next.time.slice(0, 5)}`) : d.term?.name ?? "My day"} <NotifyBell settingsHref="/admin/teacher/notifications" /></p>
        <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hello</span> {me.name.split(" ")[0]}</span>{next && <><span className="fx-nextk">Next lesson</span><Link className="fx-title-link" href={next.kind && next.kind !== "class" ? "/admin/teacher/ones" : `/admin/register/${next.id}`} title={next.kind && next.kind !== "class" ? "Your 1:1s and workshops" : "The lesson: who’s expected, SEND, tasters and the register"}>{next.name}</Link></>}</h1>
        <div className="fx-sub-row"><p className="fx-hero-s">{next ? next.kind === "one" ? next.detail : next.kind === "workshop" ? `${next.students} booked · ${next.detail}` : <>{next.students} student{next.students === 1 ? "" : "s"}{next.tasters.length ? ` · ${next.tasters.length} taster${next.tasters.length > 1 ? "s" : ""}` : ""}{next.absent.length ? ` · away: ${next.absent.join(", ")}` : ""}</> : "No lessons in the next 7 days."}</p>{next && next.kind !== "one" && next.kind !== "workshop" && <SlidesButton eventId={next.id} url={next.slides_url ?? null} found={found.get(next.id) ?? null} n={next.lesson_no} />}</div>
      </div>{next && <div className="fx-side"><LessonClock date={next.d} time={next.time} />
</div>}
      <div className="fx-foot">{next && (next.birthdays?.length || next.send?.length) ? <div className="fx-notes">{!!next.birthdays?.length && <p className="fx-bday"><span className="fx-nh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 1.2 1.5 2.1 1.5 2.8a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-2.8zM11.2 8h1.6v3h-1.6zM4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.2c-1.4 1.2-2.6 1.2-4 0-1.4 1.2-2.6 1.2-4 0-1.4 1.2-2.6 1.2-4 0-.7.6-1.3.9-2 .9zM4 17.5c.7 0 1.4-.2 2-.7 1.4 1.2 2.6 1.2 4 0 1.4 1.2 2.6 1.2 4 0 1.4 1.2 2.6 1.2 4 0 .6.5 1.3.7 2 .7V21H4z" fill="currentColor"/></svg><span className="sr-only">Birthdays</span></span>
          <span className="fx-lines">{[...next.birthdays].sort((x, y) => x.d.localeCompare(y.d)).map((b, i) => <span key={i}><b>{b.name}</b> · {b.d === today ? "today" : wd(b.d)} · turns {b.age}</span>)}</span></p>}
        {!!next.send?.length && <div className="fx-bday fx-send">
          <span className="fx-nh"><span className="fx-sicon" aria-hidden="true">S</span><span className="sr-only">SEND in this class</span></span>
          <span className="fx-lines">{next.send.map((x, i) => { const m = /^(.*?) \((.*)\)$/.exec(x);
            return <span key={i}><b className="fx-nm">{m ? m[1] : x}</b>{m ? ` · ${m[2]}` : ""}</span>; })}</span></div>}</div> : null}
        {next && <div className="fx-btns fx-btns-r"><LessonLinkButton date={next.d} time={next.time} url={next.meet_url ?? null} title={next.meet_url ? joinLabel(next.meet_url) : undefined} none={next.kind && next.kind !== "class" ? "The Google Meet invitation is in your Google Calendar" : undefined} />
          {next.tasters.length > 0 && <div className="fx-bday fx-tasters"><span className="fx-nh"><span className="fx-sicon fx-ticon" aria-hidden="true">T</span><span className="sr-only">Tasters in this lesson</span></span>
            <span className="fx-lines">{next.tasters.map((t, i) => <span key={i}><b>{t}</b> · taster</span>)}</span></div>}
        </div>}</div></section> },
    { id: "reports-pop", title: "Reports to write", node: <Link href="/admin/teacher/reports" className="dx-pop c4"><span>{d.reportCycle ?? "Reports"}</span>
        <b className="fx-big">{d.reportsLeft}</b>
        {total > 0 && <span className="fx-pop-prog"><span className="fx-pop-bar" role="img" aria-label={`${rpct}% of reports written`}><i style={{ width: `${rpct}%` }} /></span><small>{done} of {total} written · {rpct}%</small></span>}
        <span>{d.reportsLeft ? `comment${d.reportsLeft === 1 ? "" : "s"} to write${d.reportsDue ? ` · due ${dm(d.reportsDue)}` : ""} →` : "Nothing to write right now →"}</span></Link> },
    { id: "k-attendance", title: "Attendance in my classes", node: <div className="dx-kpi ring c3"><div><span className="k">Attendance in my classes</span><span className="v">{d.attendance == null ? "–" : `${d.attendance}%`}</span><span className="h">this term</span></div><Ring pct={d.attendance} tone={d.attendance == null ? "brand" : d.attendance < 50 ? "bad" : d.attendance < 80 ? "warn" : "good"} /></div> },
    { id: "k-reports", title: "Reports written", node: <div className="dx-kpi ring c3"><div><span className="k">Reports written</span><span className="v">{rpct == null ? "–" : `${rpct}%`}</span><span className="h">{total ? `${done} of ${total}` : "none open"}</span></div><Ring pct={rpct} /></div> },
    // 26 Nov: the coming 1:1s and workshops listed (was a count of this week's 1:1s); same id so saved layouts keep it
    { id: "k-ones", title: "1:1s & workshops", node: <section className="dx-card dx-tall"><header><h2>1:1s &amp; workshops</h2>{d.onesThisWeek > 0 && <span className="dx-count" title="1:1s this week">{d.onesThisWeek}</span>}<Link className="dx-more" href="/admin/teacher/ones">All →</Link></header>
      {ones.length === 0 ? <div className="dx-clear"><Ico d={IC.users} /><b>Nothing booked</b><span>Your coming 1:1s and workshops show here.</span></div>
        : <div className="dx-list dx-scroll">{ones.map((o) => <Link key={o.kind + o.id} className={`dx-item ${o.kind === "workshop" ? "good" : "info"}`} href="/admin/teacher/ones">
          <span className="t"><span className={`pill ${o.kind === "workshop" ? "good" : "info"}`}>{o.kind === "workshop" ? "Workshop" : "1:1"}</span><b>{o.kind === "one" ? o.title.replace(/^1:1 · /, "") : o.title}</b>
            <span>{whenOne(o.at)} · {o.minutes} min{o.detail ? ` · ${o.detail}` : ""}{o.kind === "workshop" ? ` · ${o.booked ?? 0}${o.capacity ? `/${o.capacity}` : ""} booked` : ""}</span></span>
          <span className="go" aria-hidden="true">→</span></Link>)}</div>}
    </section> },
    { id: "k-pay", title: "My pay this term", node: <Link href="/admin/teacher/pay" className="dx-kpi c3"><Ico d={IC.pound} /><span className="k">My pay this term</span><span className="v">{gbp(d.payThisTerm)}</span><span className="h">{d.term ? `paid ${dm(d.term.pay_date)}` : ""}</span></Link> },
    // 26 Nov: today's lessons only (was the whole week); with none left today, when the next one is
    { id: "week", title: "Today", node: <section className="dx-card c7 dx-tall"><header><h2>Today</h2><span className="dx-sub">{wd(today)} {dm(today)}</span><Link className="dx-more" href="/admin/teacher/timetable">Timetable →</Link></header>
        {!d.week.some((l) => l.d === today) ? <div className="dx-clear"><Ico d={IC.check} /><b>No more lessons today</b><span>{next ? <>Next: {wd(next.d)} {dm(next.d)} · {next.time.slice(0, 5)} · {next.name}</> : "No lessons coming up."}</span></div>
        : <div className="dx-scroll">{d.week.filter((l) => l.d === today).map((l) => <div className="fx-row" key={l.id}>
          <span className="fx-when">{l.time.slice(0, 5)}</span>
          {l.kind === "one" || l.kind === "workshop" ? <div className="t"><b>{l.name}</b><span>{l.kind === "workshop" ? `${l.students} booked · ` : ""}{l.detail}</span></div>
          : <div className="t"><b>{l.name}</b><span>{l.students} student{l.students === 1 ? "" : "s"}
            {l.not_in_classroom ? ` · ${l.not_in_classroom} not in Classroom yet` : ""}
            {l.tasters.length ? ` · ${l.tasters.length} taster${l.tasters.length > 1 ? "s" : ""}: ${l.tasters.join(", ")}` : ""}
            {l.absent.length ? ` · away: ${l.absent.join(", ")}` : ""}</span></div>}
          {l.id !== next?.id && l.kind !== "one" && l.kind !== "workshop" && <SlidesButton compact eventId={l.id} url={l.slides_url ?? null} found={found.get(l.id) ?? null} />}
          {l.kind !== "one" && l.kind !== "workshop" && (l.d < today || l.status !== "scheduled") && <Link className="abtn sm" href={`/admin/register/${l.id}`}>Attendance</Link>}
          {l.kind !== "one" && l.kind !== "workshop" && l.d >= today && l.status === "scheduled" && <Link className="abtn sm" href={`/admin/register/${l.id}#change`} title="Ask the office to cancel or move this lesson">Change</Link>}{/* the lesson link is only in the hero */}
        </div>)}</div>}
      </section> },
    { id: "reports", title: "Reports progress", node: <section className="dx-card c5 dx-tall"><header><h2>{d.reportCycle ?? "Reports"}</h2><Link className="dx-more" href="/admin/teacher/reports">Write →</Link></header>
        {d.reportBars.length === 0 ? <p className="empty">No reports to write right now.</p> : <div className="bars">{d.reportBars.map((r) => <div className="brow" key={r.group_id}>
          <span className="lbl">{r.name}</span><div className="track"><i style={{ width: `${r.total ? r.done / r.total * 100 : 0}%` }} /></div><span className="num">{r.done}/{r.total}</span></div>)}</div>}
      </section> },
    { id: "behind", title: "Behind on assignments", size: "l", node: <section className="dx-card dx-tall"><header><h2>Behind on assignments</h2>{behind.length > 0 && <span className="dx-count">{behind.length}</span>}<Link className="dx-more" href="/admin/teacher/classes">My classes →</Link></header>
      {!so ? <p className="empty">Couldn’t load the Classroom work.</p> : so.classroom.granted !== true ? <p className="empty">Google Classroom isn’t connected to the school site yet, so work can’t be shown.</p> : so.classroom.linked === 0 ? <p className="empty">None of your classes is linked to Google Classroom yet.</p>
        : behind.length === 0 ? <div className="dx-clear"><Ico d={IC.check} /><b>Nobody behind</b><span>Every piece of work due this school year has been handed in.</span></div>
        : <><p className="cs" style={{ margin: "0 0 10px" }}>{so.totals.missing} piece{so.totals.missing === 1 ? "" : "s"} of work past the due date and not handed in, from {behind.length} student{behind.length === 1 ? "" : "s"}{so.totals.due ? ` · ${Math.round((so.totals.handed / so.totals.due) * 100)}% handed in overall` : ""}.</p>
          <MoreList className="dx-list" limit={5}>{behind.map((r) => <Link key={r.id} className={`dx-item dx-wk ${r.missing >= 2 ? "bad" : "warn"}`} href={`/admin/teacher/classes/${r.missingList[0]?.gid ?? ""}#assignments`}>
            <span className="t"><b>{r.name} · {r.missing} missing</b><span>{r.missingList.slice(0, 2).map((m) => `${m.title} (${r.classes.find((c) => c.id === m.gid)?.name ?? m.code}, due ${dueDay(m.due_at)})`).join(" · ")}{r.missing > 2 ? ` · and ${r.missing - 2} more` : ""}</span>
              {r.notInClassroom > 0 && <span style={{ fontSize: 13 }}>Not in the Google Classroom yet</span>}</span><span className="go" aria-hidden="true">→</span></Link>)}</MoreList></>}
      {so && so.classroom.at && <p className="cs" style={{ margin: "10px 0 0", fontSize: 13 }}>From Google Classroom, read {(() => { const n = Math.round((Date.now() - Date.parse(so.classroom.at!)) / 60000); return n < 60 ? `${Math.max(1, n)} min ago` : n < 1440 ? `${Math.round(n / 60)} h ago` : `${Math.round(n / 1440)} days ago`; })()}.</p>}
    </section> },
    { id: "marking", title: "Marking countdown", size: "l", node: <section className="dx-card dx-tall"><header><h2>Marking</h2>{urgent > 0 && <span className="dx-count">{urgent}</span>}<span className="dx-sub">{TURNAROUND_DAYS}-day turnaround</span><Link className="dx-more" href="/admin/teacher/marking">All marking →</Link></header>
      {!so ? <p className="empty">Couldn’t load the Classroom work.</p> : so.classroom.granted !== true ? <p className="empty">Google Classroom isn’t connected to the school site yet, so work can’t be shown.</p>
        : marking.length === 0 ? <div className="dx-clear"><Ico d={IC.check} /><b>All marked</b><span>Nothing handed in is waiting to be returned.</span></div>
        : <><p className="cs" style={{ margin: "0 0 10px" }}>{marking.reduce((a, m) => a + m.toMark, 0)} hand-in{marking.reduce((a, m) => a + m.toMark, 0) === 1 ? "" : "s"} to mark and return in Classroom, each within {TURNAROUND_DAYS} days of its due date.</p>
          <MoreList className="dx-list" limit={5}>{marking.map((m) => <a key={m.cw} className={`dx-item dx-wk dx-mk ${tone(m.daysLeft) === "ok" ? "info" : tone(m.daysLeft)}`} href={m.link ?? `/admin/teacher/classes/${m.gid}#assignments`} target={m.link ? "_blank" : undefined} rel="noopener">
            <span className="t"><b>{m.title}</b><span>{m.cls} · {m.toMark} to mark{m.toMark <= 3 ? `: ${m.names.join(", ")}` : ""}</span></span>
            <span className={`dx-cd ${tone(m.daysLeft)}`}>{countdown(m.daysLeft)}</span></a>)}</MoreList></>}
    </section> },
    { id: "messages", title: "Messages", size: "l", node: <section className="dx-card dx-tall"><header><h2>Messages</h2>{unreadN > 0 && <span className="dx-count">{unreadN}</span>}<NavCountSync href="/admin/teacher/messages" count={unreadN} /><Link className="abtn sm" style={{ marginLeft: "auto" }} href="/admin/teacher/messages?new=1">New message</Link><Link className="dx-more" style={{ marginLeft: 0, whiteSpace: "nowrap" }} href="/admin/teacher/messages" title="All messages">All →</Link></header>
      {inbox.length === 0 ? <div className="dx-clear"><Ico d={IC.check} /><b>No messages yet</b><span>Messages from the office and families show here.</span></div>
        : <div className="dx-list dx-scroll">{inboxSorted.slice(0, 12).map((it) => <Link key={it.kind + it.id} className={`dx-item ${it.unread ? "warn" : "info"}`} href={`/admin/teacher/messages?${it.kind}=${encodeURIComponent(it.id)}`}>
          <span className="t">{it.unread ? <span className="pill warn">{it.unread > 1 ? `${it.unread} new` : "New"}{it.kind === "family" ? " · family" : ""}</span> : <span className="pill mute">{it.kind === "family" ? "Family" : "School"}</span>}
            <b>{it.subject || "(no subject)"}</b><span>{it.who}{it.preview ? ` · ${it.preview.length > 70 ? it.preview.slice(0, 70) + "…" : it.preview}` : ""}</span><span style={{ fontSize: 13 }}>{onDay(it.at)}</span></span><span className="go" aria-hidden="true">→</span></Link>)}</div>}
    </section> },
    { id: "email", title: "The school", size: "l", node: <section className="dx-card dx-tall"><header><h2>The school</h2><span className="dx-sub">your messages</span><Link className="dx-more" href="/admin/teacher/messages">All messages →</Link></header>
      {(() => {
        type Row = { key: string; at: string; node: React.ReactNode };
        const rows: Row[] = [
          ...fromOffice.map((t) => ({ key: "o" + t.id, at: t.last_at, node: <Link key={"o" + t.id} className={`dx-item ${t.unread ? "warn" : t.last_sender === "teacher" ? "good" : "info"}`} href={`/admin/teacher/messages?office=${t.id}`}>
            <span className="t">{t.unread ? <span className="pill warn">New from the office</span> : t.last_sender === "teacher" ? <span className="pill good">You replied</span> : <span className="pill mute">From the office</span>}<b>{t.subject || "(no subject)"}</b>
              {t.last_body && <span>{t.last_body.length > 110 ? t.last_body.slice(0, 110) + "…" : t.last_body}</span>}<span style={{ fontSize: 13 }}>{dm(t.last_at.slice(0, 10))}</span></span><span className="go" aria-hidden="true">→</span></Link> })),
          ...mail.map((e) => ({ key: "e" + e.id, at: e.replied_at ?? e.at, node: <Link key={"e" + e.id} className={`dx-item ${e.replied_at ? "good" : "info"}`} href={`/admin/teacher/messages?school=${encodeURIComponent(e.thread_id)}#e-${e.id}`}>
            <span className="t">{e.replied_at ? <span className="pill good">Replied</span> : <span className="pill mute">Sent</span>}<b>{e.subject || "(no subject)"}</b>
              <span>{(e.reply_body ?? e.body).length > 110 ? (e.reply_body ?? e.body).slice(0, 110) + "…" : (e.reply_body ?? e.body)}</span><span style={{ fontSize: 13 }}>{dm((e.replied_at ?? e.at).slice(0, 10))}</span></span><span className="go" aria-hidden="true">→</span></Link> })),
        ].sort((a, b) => b.at.localeCompare(a.at));
        return rows.length === 0 ? <div className="dx-clear"><Ico d={IC.check} /><b>No messages yet</b><span>Message the school from here.</span></div>
          : <MoreList className="dx-list" limit={4}>{rows.map((r) => r.node)}</MoreList>;
      })()}
      <div style={{ marginTop: 12 }}><Link className="abtn sm" href="/admin/teacher/messages">Message the school</Link></div>
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
            <b>{it.title || "(no title)"}</b>{it.text && <span>{it.text.length > 120 ? it.text.slice(0, 120) + "…" : it.text}</span>}<span style={{ fontSize: 13 }}>{it.course}{it.at ? ` · ${dm(it.at.slice(0, 10))}` : ""}</span></span>{it.link && <span className="go" aria-hidden="true">{it.video ? "▶" : "→"}</span>}</>;
          return it.link ? <a key={it.id} className="dx-item info" href={it.link} target="_blank" rel="noopener" title={it.video ? "Watch the video" : "Open in Google Classroom"} style={it.colour ? { borderLeftColor: it.colour } : undefined}>{inner}</a> : <div key={it.id} className="dx-item info">{inner}</div>; })}</MoreList>}
    </section> },
  ];
  // class chats switched off for the school: that module is shown greyed out (26 Nov: Messages stays on; writing to families is off on the Messages page)
  if (familyOn) return modules;
  return modules.map((m) => m.id === "chats" ? { ...m, node: <div className="is-off" title="Switched off for now">{m.node}<p className="off-note">Switched off for now</p></div> } : m);
}

export const TEACHER_BUILT_IN: { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full"; h?: "s" | "m" | "l" }[] = [
  { id: "hero", size: "xl" }, { id: "reports-pop", size: "m" },
  { id: "k-attendance", size: "m" }, { id: "k-ones", size: "m" }, { id: "k-pay", size: "m" },
  { id: "week", size: "l", h: "m" }, { id: "reports", size: "l", h: "m" }, { id: "messages", size: "l", h: "m" }, { id: "email", size: "l", h: "m" }, { id: "behind", size: "l", h: "m" }, { id: "marking", size: "l", h: "m" },
];
