import { NotifyBell } from "../../NotifyBell";
import Link from "next/link";
import { LessonClock, LessonCountdown } from "../../LessonClock";
const ldate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
import { requireStudent } from "@/lib/family-auth";
import { studentHome } from "@/lib/family";
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
  const [h, last] = await Promise.all([studentHome(f.id), studentLastSlides(f.id).catch(() => new Map())]);
  const now = Date.now();
  const next = h.classes.filter((c) => c.next).sort((a, b) => Date.parse(a.next!) - Date.parse(b.next!))[0];
  const soon = !!next?.next && Date.parse(next.next) - now < 20 * 60e3;
  const pts = h.points?.points ?? 0, rank = h.points?.rank;
  const chatOff = h.me.chat_access === "none";
  const modules: BoardModule[] = [
    { id: "hero", title: "Next lesson", node: <section className={`dx-hero c8${next ? " has-clock" : ""}`} data-lesson={next ? `${next.subject}, ${hm(next.next!)}` : undefined}>
        {next ? <><div className="fx-main">
          <p className="fx-live" style={soon ? undefined : { color: "#c9cdea" }}>{soon && <i />}{soon ? whenText(next.next!, now) : `Next lesson · ${dlong(next.next!)}`}</p>
          <h1 className="fx-hero-t"><span className="fx-hi"><span className="fx-hello">Hi</span> {h.me.first} ✦</span><br />{next.subject}</h1>
          <p className="fx-hero-s">{hm(next.next!)}{next.teacher ? ` with ${next.teacher}` : ""} · {next.level}</p>
          {next.invited && <p className="fx-hero-s"><b>Accept the Google Classroom invitation in your email first.</b></p>}
          <div className="fx-btns">{next.meet && <a className={soon ? "go" : undefined} href={`/join/${next.group_id}`} target="_blank" rel="noopener">{joinLabel(next.meet)}</a>}<Link href={`/student/class/${next.group_id}`}>Open class</Link>
            {last.get(next.group_id) && <a href={last.get(next.group_id)!.url} target="_blank" rel="noopener" title={last.get(next.group_id)!.title}>Last lesson’s slides</a>}
            <LessonCountdown date={ldate(next.next!)} time={hm(next.next!)} /><NotifyBell settingsHref="/student/notifications" /></div>
        </div><LessonClock date={ldate(next.next!)} time={hm(next.next!)} /></> : <><h1 className="fx-hero-t"><span className="fx-hello">Hi</span> {h.me.first} ✦</h1><p className="fx-hero-s">{h.classes.length ? "No lessons coming up just now: enjoy the break." : "You’re not in any classes yet."}</p></>}
      </section> },
    { id: "points", title: "Reward points", node: <Link href="/student/rewards" className="dx-pop c4"><span>Reward points this term</span><b className="fx-big">{pts}</b>
        <span>{rank && pts ? `${ordinal(rank)} in the school →` : "Earn points for great work →"}</span></Link> },
    { id: "classes", title: "My classes", size: "full", node: <div className="fx-tiles">{h.classes.map((c) => <Link key={c.group_id} href={`/student/class/${c.group_id}`} className="fx-cls c4" style={{ ["--c" as string]: c.colour }}>
        <small>{c.level}</small><b>{c.subject}</b>{c.invited && <em>Accept your Classroom invitation</em>}
        <span>{c.next ? `${dlong(c.next)} ${hm(c.next)}` : c.slots ?? "Times to follow"}</span></Link>)}</div> },
    { id: "chat", title: "Chat", node: <section className="dx-card c4"><header><h2>Chat</h2>{!chatOff && <Link className="dx-more" href="/student/chat">Open →</Link>}</header>
        <div className="fx-ringv"><Ico d={IC.chat} /><span>{chatOff ? "Chat is off. Ask your parent to turn it on." : h.me.chat_access === "class" ? "Talk with your classes and teachers." : "Talk with your classes, teachers and friends."}</span></div></section> },
  ];
  const b = await boardLayout("student-home", null, BOARD_MODULES["student-home"], BUILT_IN);
  return <div className="fx fx-board">
    <BentoBoard page="student-home" modules={modules} layout={b.layout} defaults={BUILT_IN}
      saved={b.std} scope="standard" locked={!f.viewer || b.mirrored} audience="students" />
  </div>;
}

const BUILT_IN: { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full" }[] = [
  { id: "hero", size: "xl" }, { id: "points", size: "m" }, { id: "classes", size: "xl" }, { id: "chat", size: "m" },
];
