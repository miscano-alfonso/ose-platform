"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inboxMessageAction, replyInboxAction, markInboxReadAction } from "./actions";

type Full = { body: string; to: string; replied: { at: string; from: string; body: string } | null; files?: { id: string; name: string; size: number }[]; links?: string[] };
type Sig = { name: string; title: string; email: string; web: string; logo: string; logoDark: string };
const sigText = (x: Sig) => [x.name, x.title, x.email, x.web].filter(Boolean).join("\n");
export type PanelMail = { id: string; name: string; email: string; familyHref: string | null; subject: string; when: string; kind: [string, string] | null;
  mailbox: string | null; gmail: string | null; read: boolean; replied: boolean; first: string };

/** Inbox → the right-hand panel: the chosen email in full; "Reply" opens the reply box above it (sent from the
 *  Reply-from address). Opening an email (clicking it in the list) marks it read. */
export function InboxPanel({ m, sig, from, opened }: { m: PanelMail; sig: Sig; from: string; opened: boolean }) {
  const [mail, setMail] = useState<Full | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(`Hi ${m.first},\n\n\n\nKind regards,\n${sig.name.split(" ")[0]}`);
  const [sent, setSent] = useState(m.replied);
  const [read, setRead] = useState(m.read);
  const [replying, setReplying] = useState(false);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    let live = true;
    inboxMessageAction(m.id).then((r) => { if (!live) return; if ("error" in r) setErr(r.error); else setMail(r); });
    if (opened && !m.read) markInboxReadAction(m.id, true).then(() => { if (live) { setRead(true); router.refresh(); } });
    return () => { live = false; };
  }, [m.id, m.read, opened]);
  const send = () => start(async () => {
    setMsg(null); const r = await replyInboxAction(m.id, text);
    if (r.ok) { setSent(true); setMsg(`Sent from ${from}.`); setMail((x) => x && { ...x, replied: { at: new Date().toISOString(), from, body: `${text}\n\n${sigText(sig)}` } }); }
    else setMsg(r.error ?? "The reply wasn’t sent.");
  });
  const toggleRead = () => start(async () => { await markInboxReadAction(m.id, !read); setRead(!read); router.refresh(); });
  return <div className="ibp" aria-label={`Email from ${m.name}`}>
    <div className="ibp-head">
      <div className="ibp-who"><b>{m.familyHref ? <Link href={m.familyHref}>{m.name}</Link> : m.name}</b>
        <span className="muted">{m.email}{m.mailbox ? ` · to ${m.mailbox}` : ""}</span></div>
      <span className="ibp-when"><button type="button" className="abtn sm pri" onClick={() => setReplying(true)} disabled={!mail || replying}>Reply</button>{m.when}</span>
    </div>
    <h3 className="ibp-subj">{m.subject || "(no subject)"} {m.kind && <span className={`pill ${m.kind[0]}`} style={{ fontSize: 12, verticalAlign: 2 }}>{m.kind[1]}</span>}{sent && <span className="pill good" style={{ fontSize: 12, verticalAlign: 2, marginLeft: 4 }}>Replied</span>}</h3>
    <div className="ibp-acts">{m.gmail && <a className="abtn sm" href={m.gmail} target="_blank" rel="noopener">Open in Gmail</a>}
      <button type="button" className="abtn sm" onClick={toggleRead} disabled={busy}>{read ? "Mark unread" : "Mark read"}</button></div>
    {!mail && !err && <p className="muted">Loading the email…</p>}
    {err && <p className="note msg bad" style={{ margin: 0 }}>{err}</p>}
    {mail && <>
      {replying && <div className="ibp-reply">
      <label className="fld">Reply from <b>{from}</b><textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} className="mini" style={{ width: "100%" }} /></label>
      <SigPreview sig={sig} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="abtn pri" disabled={busy || !text.trim()} onClick={send}>{busy ? "Sending…" : mail.replied ? "Send another reply" : "Send reply"}</button>
        <button type="button" className="abtn" disabled={busy} onClick={() => setReplying(false)}>Cancel</button>
        {msg && <span role="status" className={sent && msg.startsWith("Sent") ? "muted" : "bad"} style={{ fontSize: 15 }}>{msg}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Sent through {from}’s Gmail, so it’s in its Sent folder and the family’s reply comes back to that inbox.</p>
      </div>}
      {mail.replied && <div className="irp-sent"><b>You replied from {mail.replied.from}</b> · {new Date(mail.replied.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}<div>{mail.replied.body}</div></div>}
      <p className={replying || mail.replied ? "ibp-orig" : "ibp-orig first"}>{m.name} wrote · {m.when}</p>
      <div className="irp-mail">{mail.body || "(This email has no text.)"}</div>
      {((mail.files?.length ?? 0) > 0 || (mail.links?.length ?? 0) > 0) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {(mail.files ?? []).map((f) => <a key={f.id} className="abtn sm" href={`/admin/email-file/${f.id}`}>{f.name} · {f.size > 1e6 ? `${(f.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1e3))} KB`}</a>)}
        {(mail.links ?? []).map((l) => <a key={l} className="abtn sm" href={l} target="_blank" rel="noopener">{/drive\.google|docs\.google/.test(l) ? "Google Drive link" : l.replace(/^https:\/\//, "").slice(0, 40)}</a>)}</div>}
    </>}
  </div>;
}

/** The signature as it shows in the family's email: blue logo in light mode, white in dark mode (where the email app supports it). */
export function SigPreview({ sig }: { sig: Sig }) {
  return <div className="irp-sig" aria-label="Your signature, added under the reply"><b>{sig.name}</b>{sig.title && <span>{sig.title}</span>}
    {(sig.email || sig.web) && <span className="sig-c">{sig.email}{sig.email && sig.web && <br />}{sig.web}</span>}
    {sig.logo && <><img className="sig-l" src={sig.logo} alt="School logo" width={130} /><img className="sig-d" src={sig.logoDark} alt="" width={130} /></>}</div>;
}

/** In the list: a small dot to mark one email read or unread without opening it. */
export function ReadToggle({ id, read }: { id: string; read: boolean }) {
  const [r, setR] = useState(read), [busy, start] = useTransition(), router = useRouter();
  return <button type="button" className={`ibx-dot${r ? " read" : ""}`} disabled={busy} aria-pressed={!r}
    title={r ? "Mark unread" : "Mark read"} aria-label={r ? "Mark unread" : "Mark read"}
    onClick={() => start(async () => { await markInboxReadAction(id, !r); setR(!r); router.refresh(); })} />;
}
