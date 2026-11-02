import { NotifyBell } from "../../NotifyBell";
import Link from "next/link";
import { LessonClock, LessonCountdown, RefreshAt } from "../../LessonClock";
const ldate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
import { requireStudent } from "@/lib/family-auth";
import { studentHome, studentNextOne } from "@/lib/family";
import { studentOneCourses } from "@/lib/one-courses";
import { studentLastSlides } from "@/lib/lesson-slides";
import { boardLayout } from "@/lib/dashboard-layout";
import { BOARD_MODULES } from "@/lib/dash-modules";
import { BentoBoard, type BoardModule } from "../../admin/BentoBoard";
import { dlong, hm } from "../fmt";
import { joinLabel } from "@/lib/video";
import { Ico, IC, ordinal, whenText } from "../../admin/DashBits";

// The student's home, Bento style: the next lesson up top with Join, reward points in lime, a coloured tile per class.
export default async function StudentHome() {
  const f = await requireStudent();
  const [h, last, one, ones] = await Promise.all([studentHome(f.id), studentLastSlides(f.id).catch(() => new Map()), studentNextOne(f.id).catch(() => null), studentOneCourses(f.id)]);
  const now = Date.now();
  const next = h.classes.filter((c) => c.next).sort((a, b) => Date.parse(a.next!) - Date.parse(b.next!))[0];
  const soon = !!next?.next && Date.parse(next.next) - now < 20 * 60e3;
  const pts = h.points?.points ?? 0, rank = h.points?.rank;
  const chatOff = h.me.chat_access === "none";
  // 1 Nov: a 1:1 that comes before the next class takes the top spot, with its own Meet link
  const oneFirst = !!one && (!next?.next || Date.parse(one.at) < Date.parse(next.next));
  const oneSoon = !!one && Date.parse(one.at) - now < 20 * 60e3;
  const oneHero = one && <section className="dx-hero c8 has-clock" data-lesson={`1:1 ${one.subject}, ${hm(one.at)}`}><div className="fx-main">
      <p className="fx-live" style={oneSoon ? undefined : { color: "var(--hero-soft)" }}>{oneSoon && <i />}{oneSoon ? whenText(one.at, now) : `Next lesson · ${dlong(one.at)}`}</p>
      <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hi</span> {h.me.first} ✦</span><br />1:1 · {one.subject}</h1>
      <p className="fx-hero-s">{hm(one.at)} with {one.teacher} · {one.minutes} min{one.level ? ` · ${one.level}` : ""}</p>
      <div className="fx-btns">{one.meet ? <a className={oneSoon ? "go" : undefined} href={one.meet} target="_blank" rel="noopener">Join the 1:1</a> : <span className="fx-nomeet" title="The Google Meet invitation comes to your Google account">Meet link to follow</span>}
        <LessonCountdown date={ldate(one.at)} time={hm(one.at)} /></div>
    </div><div className="fx-side"><LessonClock date={ldate(one.at)} time={hm(one.at)} /><NotifyBell settingsHref="/student/notifications" /></div></section>;
  // 2 Nov: when the lesson (or 1:1) at the top ends, the page moves on to the next one by itself
  const heroEnds = oneFirst && one ? new Date(Date.parse(one.at) + one.minutes * 60e3).toISOString() : next?.next_end ?? null;
  const modules: BoardModule[] = [
    { id: "hero", title: "Next lesson", node: oneFirst && oneHero ? oneHero : <section className={`dx-hero c8${next ? " has-clock" : ""}`} data-lesson={next ? `${next.subject}, ${hm(next.next!)}` : undefined}>
        {next ? <><div className="fx-main">
          <p className="fx-live" style={soon ? undefined : { color: "var(--hero-soft)" }}>{soon && <i />}{soon ? whenText(next.next!, now) : `Next lesson · ${dlong(next.next!)}`}</p>
          <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hi</span> {h.me.first} ✦</span><br />{next.subject}</h1>
          <p className="fx-hero-s">{hm(next.next!)}{next.teacher ? ` with ${next.teacher}` : ""} · {next.level}</p>
          {next.invited && <p className="fx-hero-s"><b>Accept the Google Classroom invitation in your email first.</b></p>}
          <div className="fx-btns">{next.meet && <a className={soon ? "go" : undefined} href={`/join/${next.group_id}`} target="_blank" rel="noopener">{joinLabel(next.meet)}</a>}<Link href={`/student/class/${next.group_id}`}>Open class</Link>
            {last.get(next.group_id) && <a href={last.get(next.group_id)!.url} target="_blank" rel="noopener" title={last.get(next.group_id)!.title}>Last lesson’s slides</a>}
            <LessonCountdown date={ldate(next.next!)} time={hm(next.next!)} /></div>
        </div><div className="fx-side"><LessonClock date={ldate(next.next!)} time={hm(next.next!)} /><NotifyBell settingsHref="/student/notifications" /></div></> : <><h1 className="fx-hero-t"><span className="fx-hello">Hi</span> {h.me.first} ✦</h1><p className="fx-hero-s">{h.classes.length ? "No lessons coming up just now: enjoy the break." : "You’re not in any classes yet."}</p></>}
      </section> },
    { id: "points", title: "Reward points", node: <Link href="/student/rewards" className="dx-pop c4"><span>Reward points this term</span><b className="fx-big">{pts}</b>
        <span>{rank && pts ? `${ordinal(rank)} in the school →` : "Earn points for great work →"}</span></Link> },
    { id: "classes", title: "My classes", size: "full", node: <div className="fx-tiles">{h.classes.map((c) => <Link key={c.group_id} href={`/student/class/${c.group_id}`} className="fx-cls c4" style={{ ["--c" as string]: c.colour }}>
        <small>{c.level}</small><b>{c.subject}</b>{c.invited && <em>Accept your Classroom invitation</em>}
        <span>{c.next ? `${dlong(c.next)} ${hm(c.next)}` : c.slots ?? "Times to follow"}</span></Link>)}
        {ones.map((o) => <Link key={o.id} href={`/student/one/${o.id}`} className="fx-cls c4" style={{ ["--c" as string]: "#8494c2" }}>
          <small>1:1</small><b>{o.subject ?? "My 1:1"}</b><span>{one && one.subject === o.subject ? `${dlong(one.at)} ${hm(one.at)}` : `With ${o.teacher}`}</span></Link>)}</div> },
    { id: "chat", title: "Chat", node: <section className="dx-card c4"><header><h2>Chat</h2>{!chatOff && <Link className="dx-more" href="/student/chat">Open →</Link>}</header>
        <div className="fx-ringv"><Ico d={IC.chat} /><span>{chatOff ? "Chat is off. Ask your parent to turn it on." : h.me.chat_access === "class" ? "Talk with your classes and teachers." : "Talk with your classes, teachers and friends."}</span></div></section> },
  ];
  const b = await boardLayout("student-home", null, BOARD_MODULES["student-home"], BUILT_IN);
  return <div className="fx fx-board"><RefreshAt at={heroEnds} />
    <BentoBoard page="student-home" modules={modules} layout={b.layout} defaults={BUILT_IN}
      saved={b.std} scope="standard" locked={!f.viewer || b.mirrored} audience="students" />
  </div>;
}

const BUILT_IN: { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full" }[] = [
  { id: "hero", size: "xl" }, { id: "points", size: "m" }, { id: "classes", size: "xl" }, { id: "chat", size: "m" },
];
