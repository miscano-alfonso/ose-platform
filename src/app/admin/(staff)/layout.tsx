import type { Metadata } from "next";
import { requireSignedIn } from "@/lib/auth";
import { signOutAction } from "../actions";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff", robots: { index: false, follow: false } };

// Pages both admins and teachers use (registers). Teachers only reach their own lessons; each page checks.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireSignedIn();
  return <div className="adm"><div className="staffbar">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <a href={me.role === "school_admin" ? "/admin" : "/admin/teacher"}><img src="/ose-logo.png" alt="OH-SO ED" width={773} height={224} /></a>
    <span className="grow" /><span>{me.name}</span>
    <form action={signOutAction}><button className="abtn sm side-btn" type="submit">Sign out</button></form>
  </div><main className="main staffmain">{children}</main></div>;
}
