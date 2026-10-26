import Link from "next/link";
import { requireStudent } from "@/lib/family-auth";
import { studentHome } from "@/lib/family";
import { Head, dlong, hm } from "../fmt";

export default async function StudentHome() {
  const f = await requireStudent();
  const h = await studentHome(f.id);
  const soon = (iso: string | null) => !!iso && Date.parse(iso) - Date.now() < 20 * 60e3;
  return <>
    <Head title={`Hi ${h.me.first}`} sub="Your classes, lessons and rewards" />
    <div className="tiles">
      <div className="tile"><span className="k">Reward points this term</span><span className="v">{h.points?.points ?? 0}</span><span className="h">{h.points?.rank && h.points.points ? `${h.points.rank}${["th", "st", "nd", "rd"][h.points.rank % 10 > 3 || [11, 12, 13].includes(h.points.rank % 100) ? 0 : h.points.rank % 10]} in the school` : "earn points for great work"}</span></div>
      <div className="tile"><span className="k">Classes</span><span className="v">{h.classes.length}</span><span className="h">this year</span></div>
      <div className="tile"><span className="k">Chat</span><span className="v" style={{ fontSize: 20 }}>{h.me.chat_access === "none" ? "Off" : h.me.chat_access === "class" ? "Class chats" : "On"}</span><span className="h">{h.me.chat_access === "none" ? "ask your parent to turn it on" : <Link href="/student/chat">Open chat</Link>}</span></div>
    </div>
    <div className="pgrid2" style={{ marginTop: 0 }}>{h.classes.map((c) => <section className="card" key={c.group_id} style={{ margin: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="dot" style={{ background: c.colour }} /><h2 style={{ margin: 0 }}>{c.subject}</h2><span className="pill mute">{c.level}</span></div>
      <p className="cs" style={{ marginTop: 6 }}>{c.slots ?? "Times to follow"} · {c.teacher ?? "Teacher to be confirmed"}</p>
      {c.invited && <p className="note msg">Accept the Google Classroom invitation in your email first: you can’t join the lesson until you do.</p>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {c.next && <span className="note">Next lesson: <b>{dlong(c.next)} {hm(c.next)}</b></span>}
        {c.meet && <a className={`abtn sm${soon(c.next) ? " pri" : ""}`} href={c.meet} target="_blank" rel="noopener">Join the lesson</a>}
        <Link className="abtn sm" href={`/student/class/${c.group_id}`}>Open class</Link></div></section>)}</div>
    {h.classes.length === 0 && <p className="empty">You’re not in any classes yet.</p>}
  </>;
}
