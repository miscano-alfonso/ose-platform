import Link from "next/link";
import { ResetForm } from "../../forms";
import { SchoolNote } from "../../SchoolNote";

export const dynamic = "force-dynamic";

// Forgotten admin password: reset with the ADMIN_SETUP_KEY kept in Vercel (works before email sending is connected).
export default function AdminReset() {
  return <>
    <SchoolNote />
    <h1>Reset your password</h1>
    <p>Enter the setup key from Vercel (Project → Settings → Environment Variables → ADMIN_SETUP_KEY), your admin email and a new password. Every device is signed out.</p>
    <ResetForm />
    <p style={{ marginTop: 16 }}><Link href="/admin/login">Back to sign in</Link></p>
  </>;
}
