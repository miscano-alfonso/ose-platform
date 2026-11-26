import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff, needsSetup } from "@/lib/auth";
import { LoginForm } from "../../forms";
import { staffLinkAction } from "../../actions";

import { SchoolNote } from "../../SchoolNote";
import { siteInfo, isPlatformSchool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Staff sign in. 26 Nov: teachers sign in with an emailed link (one box, like families); admin accounts use their
// password (?pw=1, also for the OH-SO EdTech editor, ?cms=1). An admin who asks for a link is emailed a note to use their password.
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ cms?: string; pw?: string; sent?: string; err?: string; expired?: string }> }) {
  const sp = await searchParams;
  const cms = sp.cms === "1", pw = cms || sp.pw === "1";
  if (await currentStaff()) redirect(cms ? "/admin/cms" : "/admin");
  const setup = await needsSetup();
  const [site, own] = await Promise.all([siteInfo(), isPlatformSchool()]);
  const school = own ? "OH-SO ED" : site.name;
  if (setup) return <><SchoolNote /><h1>Staff sign in</h1><p className="ok">No admin account has been set up yet. <Link href="/admin/setup">Set one up</Link>.</p></>;
  if (pw) return <>
    <SchoolNote />
    <h1>Admin sign in</h1>
    <p>For {school} office staff, with your password.</p>
    <LoginForm cms={cms} />
    <p style={{ marginTop: 4 }}><Link href={own ? "/admin/reset" : "/osedtech/login/forgot"}>Forgotten your password?</Link></p>
    <p>Teacher? <Link href="/admin/login">Email me a sign-in link instead</Link></p>
  </>;
  return <>
    <SchoolNote />
    <h1>Staff sign in</h1>
    {sp.sent ? <>
      <p className="ok" role="status"><b>Check your email.</b> If that’s a {school} teacher’s address, we’ve sent a sign-in link. It works once, for the next 30 minutes.</p>
      <p>Nothing there after a few minutes? Check your spam folder, or <Link href="/admin/login">try again</Link>.</p>
    </> : <>
      <p>For {school} teachers: enter your email and we’ll send you a link to sign in.</p>
      {sp.expired && <p className="err" role="alert">That sign-in link has expired or was already used. Ask for a new one below.</p>}
      {sp.err && <p className="err" role="alert">{sp.err}</p>}
      <form action={staffLinkAction} style={{ display: "grid", gap: 14 }}>
        <label>Email<input type="email" name="email" autoComplete="username" required autoFocus /></label>
        <button type="submit">Email me a sign-in link</button>
      </form>
    </>}
    <p style={{ marginTop: 4 }}>Office staff: <Link href="/admin/login?pw=1">sign in with your password</Link></p>
  </>;
}
