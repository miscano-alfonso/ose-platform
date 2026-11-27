import Link from "next/link";
import { GuideSlides } from "../../../admin/GuideSlides";
import { FAMILY_GUIDES } from "../../../admin/guides";
import { requireParent } from "@/lib/family-auth";
import { kids, parentThreads, parentThread } from "@/lib/family";
import { withSchool } from "@/lib/db";
import { parentReplyAction, parentStartAction, familyOfficeReplyAction, parentMarkUnreadAction } from "../../actions";
import { myOfficeThreads, myOfficeThread } from "@/lib/office-messages";
import { Head, Flash } from "../../fmt";
import { familyMsgsOn } from "@/lib/teacher-area";

export const dynamic = "force-dynamic";
// 27 Nov (Alfonso: "make the email and message features you've made for admin, the EXACT same for the teachers and
// parents"): the parent's Messages in the admin's layout: every conversation in one list on the left (with the office,
// and with teachers), All / Unread / Office / Teachers, unread in bold with a count; the open conversation on the right
// as bubbles with the reply box under it. ?o= / ?t= opens one; ?new=1 writes a new one.
const when = (s: string) => new Date(Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"))).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
function stamp(iso: string) {
  const d = new Date(Date.parse(iso.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"))), f = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" }), now = new Date();
  if (isNaN(d.getTime())) return "";
  if (f(d) === f(now)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  if (f(d) === f(new Date(now.getTime() - 864e5))) return "Yest.";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}
const ini = (s: string) => s.replace(/[^A-Za-z\s-]/g, "").split(/[\s-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const cut = (s: string | null | undefined, n = 140) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const TABS = [["all", "All"], ["unread", "Unread"], ["office", "Office"], ["teachers", "Teachers"]] as const;
type Item = { kind: "office" | "teacher"; id: string; who: string; subject: string; sub: string | null; at: string; preview: string; unread: number; closed: boolean; canUnread: boolean };

export default async function Messages({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; t?: string; o?: string; new?: string; f?: string; subject?: string }> }) {
  const [sp, fam] = await Promise.all([searchParams, requireParent()]);
  const read = !fam.viewer;   // the office "viewing as" doesn't mark anything read
  // open the chosen conversation first (that marks it read), then build the list
  const oth = sp.o ? await myOfficeThread("parent", fam.id, sp.o, read) : null;
  const sel = !oth && sp.t ? await parentThread(fam.id, sp.t, read) : null;
  const [threads, ks, office, teachersOn] = await Promise.all([parentThreads(fam.id), kids(fam.id), myOfficeThreads("parent", fam.id).catch(() => []), familyMsgsOn()]);
  const extra = threads.length ? await withSchool((q) => q<{ id: string; body: string | null; n: number }>(`select th.id,
      (select left(m.body, 300) from messages m where m.thread_id = th.id order by m.created_at desc limit 1) as body,
      (select count(*)::int from messages m where m.thread_id = th.id and m.sender <> 'parent' and m.read_by_parent_at is null) as n
    from message_threads th where th.id = any($1::uuid[])`, [threads.map((t) => t.id)])).catch(() => []) : [];
  const items: Item[] = [
    ...office.map((t): Item => { const who = t.office_name ? `${t.office_name}` : "The office";
      return { kind: "office", id: t.id, who, subject: t.subject, sub: t.about ? `about ${t.about}` : null, at: t.last_at, preview: (t.last_sender === "office" ? "" : "You: ") + cut(t.last_body),
        unread: t.unread_n ?? (t.unread ? 1 : 0), closed: t.status === "closed", canUnread: t.last_sender === "office" }; }),
    ...threads.map((t): Item => { const x = extra.find((e) => e.id === t.id);
      return { kind: "teacher", id: t.id, who: t.teacher, subject: t.subject, sub: `about ${t.student}`, at: t.last_at, preview: (t.last_sender === "parent" ? "You: " : "") + cut(x?.body),
        unread: x?.n ?? (t.unread ? 1 : 0), closed: t.status === "closed", canUnread: t.last_sender !== "parent" }; }),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const f = TABS.some(([k]) => k === sp.f) ? sp.f! : "all";
  const unreadN = items.filter((i) => i.unread > 0).length;
  const list = items.filter((i) => f === "unread" ? i.unread > 0 : f === "office" ? i.kind === "office" : f === "teachers" ? i.kind === "teacher" : true);
  const selKey = oth ? `office:${oth.th.id}` : sel ? `teacher:${sel.th.id}` : "";
  const writing = !oth && !sel && sp.new === "1";
  const chosen = !!selKey || writing;
  const tq = f !== "all" ? `&f=${f}` : "";
  const href = (it: Item) => `/parent/messages?${it.kind === "office" ? "o" : "t"}=${it.id}${tq}`;
  const itemFor = (kind: Item["kind"], id: string) => items.find((i) => i.kind === kind && i.id === id);
  const unreadBtn = (kind: Item["kind"], id: string, cls: string, label: string) => fam.viewer ? null : <form action={parentMarkUnreadAction} className={cls}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="f" value={f} />
    <button type="submit" className="abtn sm" title="Mark as unread"><span aria-hidden="true" className="ib-dot" />{label}</button></form>;
  const head = (kind: Item["kind"], initials: string, title: string, sub: string, tag: string, extraNode?: React.ReactNode) => <div className="ib-ch">
    <span className={`ib-av ${kind === "teacher" ? "fam" : "sch"}`} aria-hidden="true">{initials}</span>
    <div className="t"><h2>{title}</h2><span className="muted">{sub}</span></div>{extraNode}<span className={`ib-tag ${kind === "teacher" ? "fam" : "sch"}`}>{tag}</span></div>;
  const bubble = (key: string, mine: boolean, who: string, at: string, body: string) =>
    <div key={key} className={`ib-b ${mine ? "me" : "them"}`}><div className="ib-body">{body}</div><small>{who} · {when(at)}</small></div>;
  const back = <Link className="abtn sm ib-back" href={`/parent/messages${f !== "all" ? `?f=${f}` : ""}`}>← All messages</Link>;

  let pane: React.ReactNode = <div className="ib-empty"><b>{items.length ? "Choose a conversation" : "No messages yet"}</b>
    <span>{items.length ? "Pick one on the left to read it and reply." : "Write to the office or your children’s teachers here."}</span>
    <Link className="abtn pri" href="/parent/messages?new=1">New message</Link></div>;
  if (oth) { const it = itemFor("office", oth.th.id); pane = <>
    {head("office", ini(it?.who ?? "The office"), oth.th.subject, `${it?.who ?? "The office"} · the office${oth.th.about ? ` · about ${oth.th.about}` : ""}${oth.th.status === "closed" ? " · closed" : ""}`, "Office",
      oth.msgs.some((m) => m.sender === "office") ? unreadBtn("office", oth.th.id, "ib-mu-h", "Mark as unread") : undefined)}
    <div className="ib-msgs">{oth.msgs.map((m) => bubble(m.id, m.sender !== "office", m.who, m.at, m.body))}</div>
    {oth.th.status === "open" ? <form action={familyOfficeReplyAction} className="ib-reply wide"><input type="hidden" name="id" value={oth.th.id} /><input type="hidden" name="kind" value="parent" />
      <textarea name="body" required rows={3} maxLength={5000} placeholder="Write a reply…" aria-label="Reply" /><button className="abtn pri" type="submit" disabled={!!fam.viewer}>Send</button></form>
      : <p className="note">This conversation is closed. Start a new message if you need to.</p>}</>; }
  else if (sel) { const it = itemFor("teacher", sel.th.id); pane = <>
    {head("teacher", ini(sel.th.teacher), sel.th.subject, `${sel.th.teacher} · about ${sel.th.student}${sel.th.status === "closed" ? " · closed" : ""}`, "Teacher",
      it?.canUnread ? unreadBtn("teacher", sel.th.id, "ib-mu-h", "Mark as unread") : undefined)}
    <div className="ib-msgs">{sel.msgs.map((m) => bubble(m.id, m.sender === "parent", m.sender === "office" ? "The office" : m.who, m.at, m.body))}</div>
    {sel.th.status === "open" ? <form action={parentReplyAction} className="ib-reply wide"><input type="hidden" name="id" value={sel.th.id} />
      <textarea name="body" required rows={3} maxLength={5000} placeholder="Write a reply…" aria-label="Reply" /><button className="abtn pri" type="submit" disabled={!!fam.viewer}>Send</button></form>
      : <p className="note">This conversation is closed. Start a new message if you need to.</p>}
    <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 0" }}>The office can read conversations with teachers.</p></>; }
  else if (writing) pane = <div className="ib-new">
    <h2>New message</h2>
    <p className="cs">{teachersOn ? "Choose a class to write to its teacher (the office can read it), or write to the office." : "Messages to teachers are switched off for now, so write to the office: they’ll pass it on."}</p>
    <form action={parentStartAction} style={{ display: "grid", gap: 10 }}>
      <label className="fld">To<select name="to" className="mini" required>
        {ks.length > 1 ? <optgroup label="The office">{ks.map((k) => <option key={"o" + k.id} value={`office|${k.id}`}>The office · about {k.first}</option>)}<option value="office|">The office · something else</option></optgroup>
          : <option value={`office|${ks[0]?.id ?? ""}`}>The office</option>}
        {teachersOn && <optgroup label="A teacher">{ks.flatMap((k) => k.classes.filter((c) => c.teacher_id).map((c) => <option key={k.id + c.group_id} value={`${k.id}|${c.group_id}`}>{c.teacher} · {k.first}’s {c.subject}</option>))}</optgroup>}</select></label>
      <label className="fld">Subject<input name="subject" required maxLength={120} className="mini" defaultValue={sp.subject ?? ""} /></label>
      <label className="fld">Message<textarea name="body" rows={6} required maxLength={5000} className="mini" style={{ width: "100%" }} /></label>
      <div style={{ display: "flex", gap: 8 }}><button className="abtn pri" type="submit" disabled={!!fam.viewer}>Send</button><Link className="abtn" href="/parent/messages">Cancel</Link></div></form></div>;

  return <>
    <Head title="Messages" sub={teachersOn ? "Messages with the office and your children’s teachers. The office can read conversations with teachers." : "Messages with the office: they’ll reply here, and pass anything on to the teachers."}>
      <GuideSlides slides={[...FAMILY_GUIDES["p-messages"].slides]} title={FAMILY_GUIDES["p-messages"].title} /><Link className="abtn pri" href="/parent/messages?new=1">New message</Link></Head>
    <Flash sp={sp} />
    <div className={`card ib${chosen ? " has-sel" : ""}`}>
      <div className="ib-list">
        <div className="segl ib-tabs" role="group" aria-label="Show">{TABS.map(([k, l]) => <Link key={k} scroll={false} href={`/parent/messages${k !== "all" ? `?f=${k}` : ""}`} aria-current={f === k ? "true" : undefined}>
          {l}{k === "unread" && unreadN > 0 && <b className="ib-n">{unreadN}</b>}</Link>)}</div>
        {list.length === 0 ? <p className="empty">{f === "unread" ? "Nothing unread." : "No conversations yet."}</p>
          : <nav className="ib-items" aria-label="Conversations">{list.map((it) => { const k = `${it.kind}:${it.id}`;
            return <div key={k} className="ib-row"><Link href={href(it)} className={`ib-it${it.unread ? " unread" : " read"}${selKey === k ? " sel" : ""}`} aria-current={selKey === k ? "true" : undefined}>
              <span className={`ib-av ${it.kind === "teacher" ? "fam" : "sch"}`} aria-hidden="true">{ini(it.who)}</span>
              <span className="t"><span className="n"><b>{it.who}</b><span className="d">{stamp(it.at)}</span></span>
                <span className="s">{it.subject}</span><span className="p">{it.preview}</span>
                <span className="m"><span className={`ib-tag ${it.kind === "teacher" ? "fam" : "sch"}`}>{it.kind === "teacher" ? "Teacher" : "Office"}</span>{it.sub && <span className="muted">{it.sub}</span>}
                  {it.closed && <span className="pill mute">Closed</span>}</span></span>
              {it.unread > 0 && <span className="ib-n" aria-label={`${it.unread} unread`}>{it.unread}</span>}</Link>
              {!it.unread && it.canUnread && unreadBtn(it.kind, it.id, "ib-mu", "Mark unread")}</div>; })}</nav>}
      </div>
      <section className="ib-conv" aria-label="Conversation">{chosen && back}{pane}</section>
    </div>
  </>;
}
