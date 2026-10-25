import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { SetupForm } from "../../forms";

export const dynamic = "force-dynamic";

// One-time: creates the first school admin account. Needs the ADMIN_SETUP_KEY set in Vercel, and closes once an admin exists.
export default async function AdminSetup() {
  if (!(await needsSetup())) redirect("/admin/login");
  return <>
    <h1>Set up the admin</h1>
    <p>Enter the setup key you added in Vercel, then choose the email and password you’ll sign in with. This page closes once it’s done.</p>
    <SetupForm />
  </>;
}
