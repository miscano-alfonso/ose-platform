"use client";
import { useState } from "react";

/** Footer newsletter sign-up: double opt-in (we email a link to confirm). The hidden "website" box catches bots. */
export function NewsletterForm() {
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget, email = (f.elements.namedItem("email") as HTMLInputElement).value.trim(), website = (f.elements.namedItem("website") as HTMLInputElement).value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg("Please enter a valid email address."); (f.elements.namedItem("email") as HTMLInputElement).focus(); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/newsletter/subscribe", { method: "POST", headers: { "content-type": "application/json", "x-ose-form": "1" }, body: JSON.stringify({ email, website }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      setDone(true); setMsg(j.already ? "You’re already subscribed. Thank you." : "Nearly there. Check your inbox and click the link to confirm."); f.reset();
    } catch (err) { setMsg((err as Error).message); }
    setBusy(false);
  }
  return <form className={`nl${done ? " done" : ""}`} onSubmit={submit} noValidate>
    <h2 className="fh">Newsletter</h2>
    <p className="nl-h">News, first.</p>
    <p className="nl-p">Space in our classes, new courses and workshops, a few times a term.</p>
    <label htmlFor="nlEmail" className="vh">Email address</label>
    <div className="nl-row"><input type="email" id="nlEmail" name="email" placeholder="Your email address" autoComplete="email" required /><button type="submit" disabled={busy}>Sign up</button></div>
    <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="nl-hp" />
    <p className="nl-msg" role="status">{msg}</p>
    <p className="nl-small">We’ll email you a link to confirm. Unsubscribe any time. <a href="/privacy" style={{ color: "inherit" }}>Privacy notice</a></p>
  </form>;
}
