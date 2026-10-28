"use client";
import { useState, useTransition } from "react";
import { inboxMessageAction, replyInboxAction } from "./actions";

type Full = { body: string; to: string; replied: { at: string; from: string; body: string } | null };
/** Inbox → Reply: opens a panel under the email with the whole message and a reply box, sent from the Reply-from address. */
export function InboxReply({ id, first, signoff, from, replied }: { id: string; first: string; signoff: string; from: string; replied: boolean }) {
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState<Full | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(`Hi ${first},\n\n\n\nKind regards,\n${signoff}`);
  const [sent, setSent] = useState(replied);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toggle = () => {
    const o = !open; setOpen(o);
    if (o && !mail) start(async () => { const r = await inboxMessageAction(id); if ("error" in r) setErr(r.error); else setMail(r); });
  };
  const send = () => start(async () => {
    setMsg(null); const r = await replyInboxAction(id, text);
    if (r.ok) { setSent(true); setMsg(`Sent from ${from}.`); setMail((m) => m && { ...m, replied: { at: new Date().toISOString(), from, body: text } }); }
    else setMsg(r.error ?? "The reply wasn’t sent.");
  });
  return <>
    <button type="button" className={`abtn sm${sent ? "" : " pri"}`} aria-expanded={open} onClick={toggle}>{open ? "Close" : sent ? "Replied ✓" : "Reply"}</button>
    {open && <div className="irp">
      {!mail && !err && <p className="muted">Loading the email…</p>}
      {err && <p className="note msg bad" style={{ margin: 0 }}>{err}</p>}
      {mail && <>
        <div className="irp-mail">{mail.body || "(This email has no text.)"}</div>
        {mail.replied && <div className="irp-sent"><b>You replied from {mail.replied.from}</b> · {new Date(mail.replied.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}<div>{mail.replied.body}</div></div>}
        <label className="fld">Reply from <b>{from}</b><textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} className="mini" style={{ width: "100%" }} /></label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="abtn pri" disabled={busy || !text.trim()} onClick={send}>{busy ? "Sending…" : mail.replied ? "Send another reply" : "Send reply"}</button>
          {msg && <span role="status" className={sent && msg.startsWith("Sent") ? "muted" : "bad"} style={{ fontSize: 15 }}>{msg}</span>}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Sent through {from}’s Gmail, so it’s in its Sent folder and the family’s reply comes back to that inbox.</p>
      </>}
    </div>}
  </>;
}
