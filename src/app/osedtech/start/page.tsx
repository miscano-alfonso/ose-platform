import Link from "next/link";
import { confirmInfo } from "@/lib/edtech-account";
import { MIN_PASSWORD } from "@/lib/auth";
import { openSchoolAction } from "../account-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open your school", robots: { index: false, follow: false } };

export default async function Start({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  const sp = await searchParams, t = (sp.t ?? "").slice(0, 80);
  const info = t ? await confirmInfo(t) : null;
  if (!info || info.done) return <section className="edt-sec"><div className="edt-wrap" style={{ maxWidth: 640 }}>
    <h1 className="edt-h2">{info?.done ? "Your school is already open" : "This link has expired"}</h1>
    <p className="edt-lead">{info?.done ? "Sign in with your email and the password you chose." : "Links work for 48 hours and only once. Sign in if you’ve already opened your school, or start again."}</p>
    <div className="edt-btns"><Link href="/osedtech/login" className="edt-btn">Sign in</Link><Link href="/osedtech/trial" className="edt-btn line">Start a free trial</Link></div>
  </div></section>;
  return <section className="edt-sec tight"><div className="edt-wrap" style={{ maxWidth: 640 }}>
    <p className="edt-eyebrow">Email confirmed · {info.plan === "growth" ? "Growth" : "Solo"} trial</p>
    <h1 className="edt-h1" style={{ fontSize: "clamp(34px,5vw,52px)" }}>Open {info.business}</h1>
    <p className="edt-lead">Choose a password for <b>{info.email}</b> and your school opens straight away.</p>
    <form action={openSchoolAction} className="edt-form" style={{ marginTop: 22 }}>
      <input type="hidden" name="t" value={t} />
      <input type="hidden" name="username" value={info.email} autoComplete="username" />
      {sp.error && <p className="edt-msg bad" role="alert">{sp.error}</p>}
      <label>Password <small>at least {MIN_PASSWORD} characters</small><input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} /></label>
      <label>Password again<input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} /></label>
      <div><button className="edt-btn" type="submit">Open my school</button></div>
      <p className="edt-note" style={{ margin: 0 }}>Your trial lasts 30 days. Nothing is emailed to families or charged while you try it.</p>
    </form>
  </div></section>;
}
