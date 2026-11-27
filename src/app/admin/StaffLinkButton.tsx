"use client";
import { useActionState, useState } from "react";
import { staffSignInLinkAction } from "./actions";

/** 27 Nov: makes a one-time sign-in link for a teacher and shows it here to copy (e.g. into WhatsApp) when the email doesn't arrive. */
export function StaffLinkButton({ id, name }: { id: string; name: string }) {
  const [st, act, pending] = useActionState(staffSignInLinkAction, {});
  const [copied, setCopied] = useState(false);
  return <form action={act} className="sl-form"><input type="hidden" name="id" value={id} />
    {!st.url && <button className="abtn sm" type="submit" disabled={pending} title={`Make a sign-in link for ${name} to send another way`}>{pending ? "Making…" : "Sign-in link"}</button>}
    {st.error && <span className="muted" style={{ fontSize: 13.5 }}>{st.error}</span>}
    {st.url && <span className="sl-out"><input readOnly value={st.url} onFocus={(e) => e.target.select()} aria-label={`Sign-in link for ${name}`} className="mini" />
      <button type="button" className="abtn sm pri" onClick={async () => { await navigator.clipboard.writeText(st.url!).catch(() => null); setCopied(true); }}>{copied ? "Copied ✓" : "Copy"}</button>
      <span className="muted" style={{ fontSize: 13 }}>Works once, for 24 hours. Send it to {name.split(" ")[0]} privately.</span></span>}
  </form>;
}
