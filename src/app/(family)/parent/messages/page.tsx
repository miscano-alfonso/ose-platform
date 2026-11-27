import { GuideSlides } from "../../../admin/GuideSlides";
import { FAMILY_GUIDES } from "../../../admin/guides";
import { requireParent } from "@/lib/family-auth";
import { kids, parentThreads, parentThread } from "@/lib/family";
import { parentReplyAction, parentStartAction, familyOfficeReplyAction } from "../../actions";
import { myOfficeThreads, myOfficeThread } from "@/lib/office-messages";
import { OfficeThreadView } from "../../OfficeThread";
import { Head, Flash, dm } from "../../fmt";
import { familyMsgsOn } from "@/lib/teacher-area";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export default async function Messages({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; t?: string; o?: string; new?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const [threads, ks, office, teachersOn] = await Promise.all([parentThreads(f.id), kids(f.id), myOfficeThreads("parent", f.id).catch(() => []), familyMsgsOn()]);
  // newest first across conversations with teachers and with the office (5 Nov)
  const rows = [...threads.map((t) => ({ ...t, o: false })), ...office.map((t) => ({ ...t, teacher: "The office", student: t.about, o: true }))].sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  const oSel = sp.new || sp.t ? null : sp.o ?? (rows[0]?.o ? rows[0].id : null);
  const oth = oSel ? await myOfficeThread("parent", f.id, oSel, !f.viewer) : null;
  const selId = sp.new || oth ? null : sp.t ?? threads[0]?.id ?? null;
  const sel = selId ? await parentThread(f.id, selId, !f.viewer) : null;
  return <>
    <Head title="Messages" sub={teachersOn ? "Message your children’s teachers or the office. The office can read conversations with teachers." : "Message the office: they’ll reply here, and pass anything on to the teachers."}><GuideSlides slides={[...FAMILY_GUIDES["p-messages"].slides]} title={FAMILY_GUIDES["p-messages"].title} /><a className="abtn pri" href="/parent/messages?new=1">New message</a></Head>
    <Flash sp={sp} />
    <div className="dgrid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
      <section className="card" style={{ margin: 0 }}>{rows.length === 0 ? <p className="empty">No messages yet.</p> : rows.map((t) => <a key={t.id} href={`/parent/messages?${t.o ? "o" : "t"}=${t.id}`} className="li" style={{ textDecoration: "none", color: "inherit", ...(t.id === (sel?.th.id ?? oth?.th.id) ? { background: "var(--hover)", borderRadius: 10, paddingInline: 8 } : {}) }}>
        <div className="t"><b>{t.subject}</b><span>{t.teacher}{t.student ? ` · about ${t.student}` : ""} · {dm(t.last_at)}</span></div>{t.unread && <span className="pill info">New</span>}{t.status === "closed" && <span className="pill mute">Closed</span>}</a>)}</section>
      <section className="card" style={{ margin: 0 }}>{oth ? <OfficeThreadView t={oth} kind="parent" action={familyOfficeReplyAction} /> : !sel ? <>
        <h2>New message</h2><p className="cs">{teachersOn ? "Choose a class to write to its teacher (the office can read it), or write to the office." : "Messages to teachers are switched off for now, so write to the office: they’ll pass it on."}</p>
        <form action={parentStartAction} style={{ display: "grid", gap: 10 }}>
          <label className="fld">To<select name="to" className="mini" required>
            {ks.length > 1 ? <optgroup label="The office">{ks.map((k) => <option key={"o" + k.id} value={`office|${k.id}`}>The office · about {k.first}</option>)}<option value="office|">The office · something else</option></optgroup>
              : <option value={`office|${ks[0]?.id ?? ""}`}>The office</option>}
            {teachersOn && <optgroup label="A teacher">{ks.flatMap((k) => k.classes.filter((c) => c.teacher_id).map((c) => <option key={k.id + c.group_id} value={`${k.id}|${c.group_id}`}>{c.teacher} · {k.first}’s {c.subject}</option>))}</optgroup>}</select></label>
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
