import Link from "next/link";
import { customerSignInAction } from "../account-actions";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const sp = await searchParams;
  return <section className="edt-sec tight"><div className="edt-wrap" style={{ maxWidth: 560 }}>
    <h1 className="edt-h1" style={{ fontSize: "clamp(34px,5vw,52px)" }}>Sign in to your school</h1>
    <p className="edt-lead">For schools on OH-SO EdTech, including free trials.</p>
    <form action={customerSignInAction} className="edt-form" style={{ marginTop: 22 }}>
      {sp.error && <p className="edt-msg bad" role="alert">{sp.error}</p>}
      <label>Email<input name="email" type="email" autoComplete="username" required maxLength={200} defaultValue={(sp.email ?? "").slice(0, 200)} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><button className="edt-btn" type="submit">Sign in</button>
        <Link href="/osedtech/login/forgot" style={{ color: "var(--teal-d)" }}>Forgotten your password?</Link></div>
    </form>
    <p className="edt-note" style={{ marginTop: 18 }}>No school yet? <Link href="/osedtech/trial" style={{ color: "var(--teal-d)" }}>Start a free trial</Link></p>
  </div></section>;
}
