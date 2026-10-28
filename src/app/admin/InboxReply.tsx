"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { inboxMessageAction, replyInboxAction, markInboxReadAction } from "./actions";

type Full = { body: string; to: string; replied: { at: string; from: string; body: string } | null };
type Sig = { name: string; title: string; email: string; web: string; logo: string; logoDark: string };
const sigText = (x: Sig) => [x.name, x.title, x.email, x.web].filter(Boolean).join("\n");
export type PanelMail = { id: string; name: string; email: string; familyHref: string | null; subject: string; when: string; kind: [string, string] | null;
  mailbox: string | null; gmail: string; read: boolean; replied: boolean; first: string };

/** Inbox → the right-hand panel: the chosen email in full, and the reply box under it (sent from the Reply-from address).
 *  Opening an email (clicking it in the list) marks it read. */
export function InboxPanel({ m, sig, from, opened }: { m: PanelMail; sig: Sig; from: string; opened: boolean }) {
  const [mail, setMail] = useState<Full | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(`Hi ${m.first},\n\n\n\nKind regards,\n${sig.name.split(" ")[0]}`);
  const [sent, setSent] = useState(m.replied);
  const [read, setRead] = useState(m.read);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    let live = true;
    inboxMessageAction(m.id).then((r) => { if (!live) return; if ("error" in r) setErr(r.error); else setMail(r); });
    if (opened && !m.read) markInboxReadAction(m.id, true).then(() => live && setRead(true));
    return () => { live = false; };
  }, [m.id, m.read, opened]);
  const send = () => start(async () => {
    setMsg(null); const r = await replyInboxAction(m.id, text);
    if (r.ok) { setSent(true); setMsg(`Sent from ${from}.`); setMail((x) => x && { ...x, replied: { at: new Date().toISOString(), from, body: `${text}\n\n${sigText(sig)}` } }); }
    else setMsg(r.error ?? "The reply wasn’t sent.");
  });
  const toggleRead = () => start(async () => { await markInboxReadAction(m.id, !read); setRead(!read); });
  return <div className="ibp" aria-label={`Email from ${m.name}`}>
    <div className="ibp-head">
      <div className="ibp-who"><b>{m.familyHref ? <Link href={m.familyHref}>{m.name}</Link> : m.name}</b>
        <span className="muted">{m.email}{m.mailbox ? ` · to ${m.mailbox}` : ""}</span></div>
      <span className="ibp-when">{m.when}</span>
    </div>
    <h3 className="ibp-subj">{m.subject || "(no subject)"} {m.kind && <span className={`pill ${m.kind[0]}`} style={{ fontSize: 12, verticalAlign: 2 }}>{m.kind[1]}</span>}{sent && <span className="pill good" style={{ fontSize: 12, verticalAlign: 2, marginLeft: 4 }}>Replied</span>}</h3>
    <div className="ibp-acts"><a className="abtn sm" href={m.gmail} target="_blank" rel="noopener">Open in Gmail</a>
      <button type="button" className="abtn sm" onClick={toggleRead} disabled={busy}>{read ? "Mark unread" : "Mark read"}</button></div>
    {!mail && !err && <p className="muted">Loading the email…</p>}
    {err && <p className="note msg bad" style={{ margin: 0 }}>{err}</p>}
    {mail && <>
      <label className="fld">Reply from <b>{from}</b><textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} className="mini" style={{ width: "100%" }} /></label>
      <SigPreview sig={sig} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="abtn pri" disabled={busy || !text.trim()} onClick={send}>{busy ? "Sending…" : mail.replied ? "Send another reply" : "Send reply"}</button>
        {msg && <span role="status" className={sent && msg.startsWith("Sent") ? "muted" : "bad"} style={{ fontSize: 15 }}>{msg}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Sent through {from}’s Gmail, so it’s in its Sent folder and the family’s reply comes back to that inbox.</p>
      {mail.replied && <div className="irp-sent"><b>You replied from {mail.replied.from}</b> · {new Date(mail.replied.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}<div>{mail.replied.body}</div></div>}
      <p className="ibp-orig">{m.name} wrote · {m.when}</p>
      <div className="irp-mail">{mail.body || "(This email has no text.)"}</div>
    </>}
  </div>;
}

/** The signature as it shows in the family's email: blue logo in light mode, white in dark mode (where the email app supports it). */
export function SigPreview({ sig }: { sig: Sig }) {
  return <div className="irp-sig" aria-label="Your signature, added under the reply"><b>{sig.name}</b>{sig.title && <span>{sig.title}</span>}
    {(sig.email || sig.web) && <span className="sig-c">{sig.email}{sig.email && sig.web && <br />}{sig.web}</span>}
    <img className="sig-l" src={sig.logo} alt="OH-SO ED Online School" width={130} /><img className="sig-d" src={sig.logoDark} alt="" width={130} /></div>;
}
