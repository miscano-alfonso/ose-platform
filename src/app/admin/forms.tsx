"use client";
import { useActionState } from "react";
import { signInAction, setupAction, changePasswordAction } from "./actions";

export function LoginForm() {
  const [st, act, busy] = useActionState(signInAction, {});
  return <form action={act} className="box-form" style={{ display: "grid", gap: 14 }}>
    {st.error && <p className="err" role="alert">{st.error}</p>}
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
