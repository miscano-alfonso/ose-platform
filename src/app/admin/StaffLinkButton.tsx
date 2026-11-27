"use client";
import { useActionState, useState } from "react";
import { staffSignInLinkAction, emailStaffLinkAction } from "./actions";

/** 27 Nov: a teacher's sign-in: email them the one-time link, or make one to copy and send another way (e.g. WhatsApp). */
export function StaffLinkButton({ id, name, email }: { id: string; name: string; email?: string }) {
  const [st, act, pending] = useActionState(staffSignInLinkAction, {});
  const [em, emAct, emPending] = useActionState(emailStaffLinkAction, {});
  const [copied, setCopied] = useState(false);
  return <div className="sl-wrap">
    <div className="sl-form">
      {email && <form action={emAct}><input type="hidden" name="email" value={email} /><button className="abtn sm" type="submit" disabled={emPending}>{emPending ? "Sending…" : "Email sign-in link"}</button></form>}
      {!st.url && <form action={act}><input type="hidden" name="id" value={id} /><button className="abtn sm" type="submit" disabled={pending} title={`Make a sign-in link for ${name} to send another way`}>{pending ? "Making…" : "Copy sign-in link"}</button></form>}
    </div>
    {em.ok && <span className="sl-st">{em.ok}</span>}{em.error && <span className="sl-st bad-t">{em.error}</span>}
    {st.error && <span className="sl-st bad-t">{st.error}</span>}
    {st.url && <span className="sl-out"><input readOnly value={st.url} onFocus={(e) => e.target.select()} aria-label={`Sign-in link for ${name}`} className="mini" />
      <button type="button" className="abtn sm pri" onClick={async () => { await navigator.clipboard.writeText(st.url!).catch(() => null); setCopied(true); }}>{copied ? "Copied ✓" : "Copy"}</button>
      <span className="muted" style={{ fontSize: 13 }}>Works once, for 24 hours. Send it to {name.split(" ")[0]} privately.</span></span>}
  </div>;
}
