import Link from "next/link";
import { forgotAction } from "../../account-actions";

export const metadata = { title: "Forgotten password", robots: { index: false, follow: false } };

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  return <section className="edt-sec tight"><div className="edt-wrap" style={{ maxWidth: 560 }}>
    <h1 className="edt-h2">Forgotten your password?</h1>
    {sp.sent ? <><p className="edt-lead">If that email opened a school with us, we’ve sent it a link to choose a new password. It works for 2 hours.</p>
      <div className="edt-btns"><Link href="/osedtech/login" className="edt-btn line">Back to sign in</Link></div></>
      : <form action={forgotAction} className="edt-form" style={{ marginTop: 18 }}>
        <p style={{ margin: 0 }}>Enter the email you started your trial with and we’ll send a link. Teachers: ask your school’s admin to send you a new invitation.</p>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
        <div><button className="edt-btn" type="submit">Email me a link</button></div></form>}
  </div></section>;
}
