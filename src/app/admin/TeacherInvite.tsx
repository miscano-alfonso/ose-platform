"use client";
import { useActionState, useState } from "react";
import { inviteTeacherAction } from "./actions";

/** Admin → Teachers, Sign-in column: invite a teacher (or invite again), with their email; the link is emailed to them. */
export function TeacherInvite({ id, email, invited }: { id: string; email: string; invited: { email: string; at: string; expired: boolean } | null }) {
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  const [st, act, busy] = useActionState(inviteTeacherAction, {});
  const real = (e: string) => (/\.example$/.test(e) ? "" : e);
  const d = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return <div className="tinv">
    {invited ? <span className={`pill ${invited.expired ? "bad" : "info"}`}>{invited.expired ? "Invite expired" : `Invited ${d(invited.at)}`}</span> : <span className="pill mute">Not invited</span>}
    {!open && !st.ok && <button type="button" className="abtn sm" onClick={() => setOpen(true)}>{invited ? "Resend invite" : "Invite"}</button>}
    {open && !st.ok && <form action={act} className="tinv-f">
      <input type="hidden" name="teacher_id" value={id} />
      <input name="email" type="email" required placeholder="Their email" defaultValue={invited?.email ?? real(email)} aria-label="Email to send the invitation to" />
      <button className="abtn sm pri" type="submit" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
      <button className="abtn sm" type="button" onClick={() => setOpen(false)}>Cancel</button></form>}
    {st.error && <span className="pill bad" role="alert">{st.error}</span>}
    {st.ok && <span className="tinv-ok" role="status">{st.ok}{st.link && <> <button type="button" className="abtn sm" onClick={() => { navigator.clipboard?.writeText(st.link!); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button></>}</span>}
  </div>;
}
