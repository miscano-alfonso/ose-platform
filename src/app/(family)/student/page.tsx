import Link from "next/link";
import { requireStudent } from "@/lib/family-auth";
import { studentHome } from "@/lib/family";
import { dlong, hm } from "../fmt";
import { joinLabel } from "@/lib/video";
import { Ico, IC, ordinal, whenText } from "../../admin/DashBits";

// The student's home, Bento style: the next lesson up top with Join, reward points in lime, a coloured tile per class.
export default async function StudentHome() {
  const f = await requireStudent();
  const h = await studentHome(f.id);
  const now = Date.now();
  const next = h.classes.filter((c) => c.next).sort((a, b) => Date.parse(a.next!) - Date.parse(b.next!))[0];
  const soon = !!next?.next && Date.parse(next.next) - now < 20 * 60e3;
  const pts = h.points?.points ?? 0, rank = h.points?.rank;
  const chatOff = h.me.chat_access === "none";
  return <>
    <div className="fx">
      <section className="dx-hero c8" data-lesson={next ? `${next.subject}, ${hm(next.next!)}` : undefined}>
        {next ? <>
          <p className="fx-live" style={soon ? undefined : { color: "#c9cdea" }}>{soon && <i />}{soon ? whenText(next.next!, now) : `Next lesson · ${dlong(next.next!)} ${hm(next.next!)}`}</p>
          <h1 className="fx-hero-t"><span style={{ fontSize: ".55em", fontWeight: 500 }}>Hi {h.me.first} ✦</span><br />{next.subject}</h1>
          <p className="fx-hero-s">{hm(next.next!)}{next.teacher ? ` with ${next.teacher}` : ""} · {next.level}</p>
          {next.invited && <p className="fx-hero-s"><b>Accept the Google Classroom invitation in your email first.</b></p>}
          <div className="fx-btns">{next.meet && <a className={soon ? "go" : undefined} href={`/join/${next.group_id}`} target="_blank" rel="noopener">{joinLabel(next.meet)}</a>}<Link href={`/student/class/${next.group_id}`}>Open class</Link></div>
        </> : <><h1 className="fx-hero-t">Hi {h.me.first} ✦</h1><p className="fx-hero-s">{h.classes.length ? "No lessons coming up just now: enjoy the break." : "You’re not in any classes yet."}</p></>}
      </section>
      <Link href="/student/rewards" className="dx-pop c4"><span>Reward points this term</span><b className="fx-big">{pts}</b>
        <span>{rank && pts ? `${ordinal(rank)} in the school →` : "Earn points for great work →"}</span></Link>
      {h.classes.map((c) => <Link key={c.group_id} href={`/student/class/${c.group_id}`} className="fx-cls c4" style={{ ["--c" as string]: c.colour }}>
        <small>{c.level}</small><b>{c.subject}</b>{c.invited && <em>Accept your Classroom invitation</em>}
        <span>{c.next ? `${dlong(c.next)} ${hm(c.next)}` : c.slots ?? "Times to follow"}</span></Link>)}
      <section className="dx-card c4"><header><h2>Chat</h2>{!chatOff && <Link className="dx-more" href="/student/chat">Open →</Link>}</header>
        <div className="fx-ringv"><Ico d={IC.chat} /><span>{chatOff ? "Chat is off. Ask your parent to turn it on." : h.me.chat_access === "class" ? "Talk with your classes and teachers." : "Talk with your classes, teachers and friends."}</span></div></section>
    </div>
  </>;
}
