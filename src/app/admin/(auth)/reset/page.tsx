import Link from "next/link";
import { ResetForm } from "../../forms";
import { SchoolNote } from "../../SchoolNote";
import { passwordResetRequestAction } from "../../actions";

export const dynamic = "force-dynamic";

// Forgotten password. 27 Nov (Alfonso): an email with a link to set a new one (admins; teachers get their sign-in link).
// The setup-key reset (ADMIN_SETUP_KEY in Vercel, works before email is connected) is kept behind "Use the setup key".
export default async function AdminReset({ searchParams }: { searchParams: Promise<{ key?: string; sent?: string; err?: string }> }) {
  const sp = await searchParams;
  if (sp.key === "1") return <>
    <SchoolNote />
    <h1>Reset with the setup key</h1>
    <p>For the person who looks after the platform: enter the setup key from Vercel (Project → Settings → Environment Variables → ADMIN_SETUP_KEY), the admin email and a new password. Every device is signed out.</p>
    <ResetForm />
    <p style={{ marginTop: 16 }}><Link href="/admin/reset">Email me a link instead</Link> · <Link href="/admin/login?pw=1">Back to sign in</Link></p>
  </>;
  return <>
    <SchoolNote />
    <h1>Forgotten your password?</h1>
    {sp.sent ? <>
      <p className="ok" role="status"><b>Check your email.</b> If that address has an account, we’ve sent a link to set a new password. It works once, for the next hour.</p>
      <p>Nothing there after a few minutes? Check your spam folder, or <Link href="/admin/reset">try again</Link>.</p>
    </> : <>
      <p>Enter the email you sign in with and we’ll send you a link to choose a new password.</p>
      {sp.err && <p className="err" role="alert">{sp.err}</p>}
      <form action={passwordResetRequestAction} style={{ display: "grid", gap: 14 }}>
        <label>Email<input type="email" name="email" autoComplete="username" required autoFocus /></label>
        <button type="submit">Email me a link</button>
      </form>
    </>}
    <p style={{ marginTop: 16 }}><Link href="/admin/login?pw=1">Back to sign in</Link></p>
    <p className="muted" style={{ fontSize: 13.5 }}>Email not working? <Link href="/admin/reset?key=1">Use the setup key</Link></p>
  </>;
}
