import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff, needsSetup } from "@/lib/auth";
import { LoginForm } from "../../forms";

export const dynamic = "force-dynamic";

export default async function AdminLogin() {
  if (await currentStaff()) redirect("/admin");
  const setup = await needsSetup();
  return <>
    <h1>Admin sign in</h1>
    <p>For OH-SO ED staff.</p>
    {setup ? <p className="ok">No admin account has been set up yet. <Link href="/admin/setup">Set one up</Link>.</p> : <LoginForm />}
  </>;
}
