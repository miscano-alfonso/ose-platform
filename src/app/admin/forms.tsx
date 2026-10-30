"use client";
import { useActionState, useState } from "react";
import { signInAction, setupAction, changePasswordAction, inviteAction, acceptInviteAction, importAction, resetPasswordAction } from "./actions";

export function LoginForm({ cms }: { cms?: boolean } = {}) {
  const [st, act, busy] = useActionState(signInAction, {});
  return <form action={act} className="box-form" style={{ display: "grid", gap: 14 }}>
    {st.error && <p className="err" role="alert">{st.error}</p>}
    {cms && <input type="hidden" name="cms" value="1" />}
    <label>Email<input type="email" name="email" autoComplete="username" required defaultValue={st.email} key={"e" + st.email} /></label>
    <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
    <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}

export function SetupForm() {
  const [st, act, busy] = useActionState(setupAction, {});
  return <form action={act} style={{ display: "grid", gap: 14 }}>
    {st.error && <p className="err" role="alert">{st.error}</p>}
    <label>Setup key<input type="password" name="key" autoComplete="off" required /></label>
    <label>Your name<input name="name" autoComplete="name" required defaultValue={st.name} key={"n" + st.name} /></label>
    <label>Email<input type="email" name="email" autoComplete="username" required defaultValue={st.email} key={"e" + st.email} /></label>
    <label>New password (12+ characters)<input type="password" name="password" autoComplete="new-password" minLength={12} required /></label>
    <label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={12} required /></label>
    <button type="submit" disabled={busy}>{busy ? "Setting up…" : "Create admin account"}</button>
  </form>;
}

export function ResetForm() {
  const [st, act, busy] = useActionState(resetPasswordAction, {});
  return <form action={act} style={{ display: "grid", gap: 14 }}>
    {st.error && <p className="err" role="alert">{st.error}</p>}
    <label>Setup key (ADMIN_SETUP_KEY in Vercel)<input type="password" name="key" autoComplete="off" required /></label>
    <label>Your admin email<input type="email" name="email" autoComplete="username" required defaultValue={st.email} key={"e" + st.email} /></label>
    <label>New password (12+ characters)<input type="password" name="password" autoComplete="new-password" minLength={12} required /></label>
    <label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={12} required /></label>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Set new password and sign in"}</button>
  </form>;
}

export function PasswordForm() {
  const [st, act, busy] = useActionState(changePasswordAction, {});
  return <form action={act} className="eform" style={{ maxWidth: 520 }}>
    {st.error && <p className="pill bad" role="alert" style={{ width: "100%" }}>{st.error}</p>}
    {st.ok && <p className="pill good" role="status" style={{ width: "100%" }}>Password changed. Other devices have been signed out.</p>}
    <label className="fld" style={{ width: "100%" }}>Current password<input type="password" name="current" autoComplete="current-password" required /></label>
    <label className="fld" style={{ width: "100%" }}>New password (12+ characters)<input type="password" name="next" autoComplete="new-password" minLength={12} required /></label>
    <label className="fld" style={{ width: "100%" }}>Confirm new password<input type="password" name="confirm" autoComplete="new-password" minLength={12} required /></label>
    <button className="abtn pri" type="submit" disabled={busy}>Change password</button>
  </form>;
}

export function InviteForm({ teachers }: { teachers: { id: string; name: string; email: string; has_account: boolean }[] }) {
  const [st, act, busy] = useActionState(inviteAction, {});
  const [role, setRole] = useState("teacher");
  const [copied, setCopied] = useState(false);
  return <div style={{ display: "grid", gap: 12 }}>
    <form action={act} className="eform" onSubmit={() => setCopied(false)}>
      <label className="fld">Access<select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="teacher">Teacher</option><option value="school_admin">Admin (full access)</option></select></label>
      {role === "teacher" && teachers.length > 0 && <label className="fld">Teacher record<select name="teacher_id" defaultValue="">
        <option value="">New teacher</option>{teachers.filter((t) => !t.has_account).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <label className="fld">Name<input name="name" required maxLength={120} /></label>
      <label className="fld">Email<input name="email" type="email" required /></label>
      <button className="abtn pri" type="submit" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>
    </form>
    {st.error && <p className="pill bad" role="alert">{st.error}</p>}
    {st.link && <div className="card" style={{ margin: 0, borderColor: "var(--good)" }}>
      <b>Invitation for {st.name} is ready.</b>
      <p className="note" style={{ margin: "4px 0 8px" }}>Send them this link (it works once, for 7 days). It won’t be shown again.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <code style={{ wordBreak: "break-all", background: "var(--soft)", padding: "6px 8px", borderRadius: 6, flex: 1, minWidth: 0 }}>{st.link}</code>
        <button type="button" className="abtn sm" onClick={() => { navigator.clipboard?.writeText(st.link!); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
      </div></div>}
  </div>;
}

export function AcceptForm({ token }: { token: string }) {
  const [st, act, busy] = useActionState(acceptInviteAction, {});
  return <form action={act} style={{ display: "grid", gap: 14 }}>
    {st.error && <p className="err" role="alert">{st.error}</p>}
    <input type="hidden" name="token" value={token} />
    <label>Choose a password (12+ characters)<input type="password" name="password" autoComplete="new-password" minLength={12} required /></label>
    <label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={12} required /></label>
    <button type="submit" disabled={busy}>{busy ? "Setting up…" : "Set password and sign in"}</button>
  </form>;
}

export function ImportForm() {
  const [st, act, busy] = useActionState(importAction, {});
  const r = st.report;
  return <div style={{ display: "grid", gap: 12 }}>
    <form action={act} className="eform">
      <label className="fld">Import file (.json)<input type="file" name="file" accept=".json,application/json" required /></label>
      <button className="abtn pri" type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    </form>
    {st.errors && <div className="card" style={{ margin: 0, borderColor: "var(--bad)" }}><b>Nothing was imported</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{st.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
    {r && <div className="card" style={{ margin: 0, borderColor: "var(--good)" }}><b>Import finished</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        <li>{r.families} new families, {r.children} new children, {r.enrolments} course places{r.skipped ? ` (${r.skipped} already there)` : ""}</li>
        <li>{r.flagged} course places marked “Needs a check”</li>
        {r.classesCreated.length > 0 && <li>Classes created (hidden from the website until you add times): {r.classesCreated.join(", ")}</li>}
        {r.capacityRaised.length > 0 && <li>Capacity raised to fit everyone: {r.capacityRaised.join(", ")}</li>}
        {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul></div>}
  </div>;
}
