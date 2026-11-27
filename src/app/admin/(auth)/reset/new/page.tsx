import Link from "next/link";
import { NewPasswordForm } from "../../../forms";
import { resetLinkOk } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set a new password" };

// 27 Nov: the link in a "Set a new password" email opens this page. The link is only used up when the form is sent.
export default async function NewPassword({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  if (!(await resetLinkOk(t))) return <>
    <h1>That link has expired</h1>
    <p>Links to set a new password work once, for an hour. <Link href="/admin/reset">Ask for a new one</Link>.</p>
  </>;
  return <>
    <h1>Set a new password</h1>
    <p>Choose a new password for your admin account. You’ll be signed out on every other device.</p>
    <NewPasswordForm t={t} />
  </>;
}
