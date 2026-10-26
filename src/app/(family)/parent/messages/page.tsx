import { requireParent } from "@/lib/family-auth";
import { kids, parentThreads, parentThread } from "@/lib/family";
import { parentReplyAction, parentStartAction } from "../../actions";
import { Head, Flash, dm } from "../../fmt";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export default async function Messages({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; t?: string; new?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const [threads, ks] = await Promise.all([parentThreads(f.id), kids(f.id)]);
  const selId = sp.new ? null : sp.t ?? threads[0]?.id ?? null;
  const sel = selId ? await parentThread(f.id, selId, !f.viewer) : null;
  return <>
    <Head title="Messages" sub="Message your children’s teachers. The office can read these conversations."><a className="abtn pri" href="/parent/messages?new=1">New message</a></Head>
    <Flash sp={sp} />
    <div className="dgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
      <section className="card" style={{ margin: 0 }}>{threads.length === 0 ? <p className="empty">No messages yet.</p> : threads.map((t) => <a key={t.id} href={`/parent/messages?t=${t.id}`} className="li" style={{ textDecoration: "none", color: "inherit", ...(t.id === sel?.th.id ? { background: "var(--hover)", borderRadius: 10, paddingInline: 8 } : {}) }}>
        <div className="t"><b>{t.subject}</b><span>{t.teacher} · about {t.student} · {dm(t.last_at)}</span></div>{t.unread && <span className="pill info">New</span>}{t.status === "closed" && <span className="pill mute">Closed</span>}</a>)}</section>
      <section className="card" style={{ margin: 0 }}>{!sel ? <>
        <h2>New message to a teacher</h2><p className="cs">Choose the class. The message goes to that class’s teacher, and the office can read it.</p>
        <form action={parentStartAction} style={{ display: "grid", gap: 10 }}>
          <label className="fld">To<select name="to" className="mini" required>{ks.flatMap((k) => k.classes.filter((c) => c.teacher_id).map((c) => <option key={k.id + c.group_id} value={`${k.id}|${c.group_id}`}>{c.teacher} · {k.first}’s {c.subject}</option>))}</select></label>
          <label className="fld">Subject<input name="subject" required maxLength={120} className="mini" /></label>
          <label className="fld">Message<textarea name="body" rows={6} required maxLength={5000} className="mini" style={{ width: "100%" }} /></label>
          <div><button className="abtn pri" type="submit">Send</button></div></form></>
      : <>
        <h2>{sel.th.subject}</h2><p className="cs">{sel.th.teacher} · about {sel.th.student}{sel.th.status === "closed" ? " · closed" : ""}</p>
        <div style={{ display: "grid", gap: 8, margin: "8px 0 12px" }}>{sel.msgs.map((m) => <div key={m.id} className="card" style={{ margin: 0, padding: "8px 12px", background: m.sender === "parent" ? "var(--soft)" : undefined }}>
          <div className="muted" style={{ fontSize: 14 }}><b>{m.who}</b> · {when(m.at)}</div><div style={{ whiteSpace: "pre-line" }}>{m.body}</div></div>)}</div>
        {sel.th.status === "open" ? <form action={parentReplyAction} style={{ display: "grid", gap: 8 }}><input type="hidden" name="id" value={sel.th.id} />
          <textarea name="body" rows={4} required maxLength={5000} className="mini" style={{ width: "100%" }} aria-label="Reply" /><div><button className="abtn pri" type="submit">Reply</button></div></form>
          : <p className="note">This conversation is closed. Start a new message if you need to.</p>}</>}</section>
    </div>
  </>;
}
