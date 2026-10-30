import Link from "next/link";
import { resetInfo } from "@/lib/edtech-account";
import { MIN_PASSWORD } from "@/lib/auth";
import { resetAction } from "../../account-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  const sp = await searchParams, t = (sp.t ?? "").slice(0, 80), info = t ? await resetInfo(t) : null;
  return <section className="edt-sec tight"><div className="edt-wrap" style={{ maxWidth: 560 }}>
    <h1 className="edt-h2">Choose a new password</h1>
    {!info ? <><p className="edt-lead">This link has expired. Links work for 2 hours.</p><div className="edt-btns"><Link href="/osedtech/login/forgot" className="edt-btn">Send a new link</Link></div></>
      : <form action={resetAction} className="edt-form" style={{ marginTop: 18 }}>
        <input type="hidden" name="t" value={t} /><input type="hidden" name="username" value={info.email} autoComplete="username" />
        {sp.error && <p className="edt-msg bad" role="alert">{sp.error}</p>}
        <label>New password <small>at least {MIN_PASSWORD} characters</small><input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} /></label>
        <label>New password again<input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} /></label>
        <div><button className="edt-btn" type="submit">Save and sign in</button></div></form>}
  </div></section>;
}
