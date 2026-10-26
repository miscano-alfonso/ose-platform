import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { signOutAction, stopViewingAction } from "../actions";
import "../admin.css";
import { DashStyles } from "../DashStyles";
import { brandSrc } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff", robots: { index: false, follow: false } };

// Pages both admins and teachers use (registers). Teachers only reach their own lessons; each page checks.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireViewer();
  const { logo } = await brandSrc();
  return <div className="adm"><DashStyles />
    {me.viewing && <form action={stopViewingAction} className="viewbar"><span>Viewing as <b>{me.name}</b> (teacher). You see exactly what they see; anything you change is recorded as you, {me.realName}.</span>
      <button className="abtn sm" type="submit">Back to the admin</button></form>}
    <div className="staffbar">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <a href={me.role === "school_admin" || me.viewing ? "/admin" : "/admin/teacher"}><img src={logo} alt="OH-SO ED" width={773} height={224} /></a>
    <span className="grow" /><span>{me.viewing ? me.realName : me.name}</span>
    <form action={signOutAction}><button className="abtn sm side-btn" type="submit">Sign out</button></form>
  </div><main className="main staffmain">{children}</main></div>;
}
