import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff, needsSetup } from "@/lib/auth";
import { LoginForm } from "../../forms";

import { SchoolNote } from "../../SchoolNote";
import { siteInfo, isPlatformSchool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ cms?: string }> }) {
  const cms = (await searchParams).cms === "1";
  if (await currentStaff()) redirect(cms ? "/admin/cms" : "/admin");
  const setup = await needsSetup();
  const [site, own] = await Promise.all([siteInfo(), isPlatformSchool()]);
  return <>
    <SchoolNote />
    <h1>Admin sign in</h1>
    <p>For {own ? "OH-SO ED" : site.name} staff.</p>
    {setup ? <p className="ok">No admin account has been set up yet. <Link href="/admin/setup">Set one up</Link>.</p> : <><LoginForm cms={cms} /><p style={{ marginTop: 16 }}><Link href={own ? "/admin/reset" : "/osedtech/login/forgot"}>Forgotten your password?</Link></p></>}
  </>;
}
