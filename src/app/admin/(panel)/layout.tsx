import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { signOutAction } from "../actions";
import { AdminNav } from "../AdminNav";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const [c] = await withSchool((q) => q<{ enq: number }>(`select (select count(*)::int from enquiries where handled_at is null) as enq`));
  return <div className="adm"><div className="app">
    <aside className="side">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a className="logo" href="/admin"><img src="/ose-logo.png" alt="OH-SO ED admin" width={773} height={224} /></a>
      <AdminNav counts={{ "/admin/enquiries": c.enq }} />
      <div className="who"><span>Signed in as<br /><b>{me.name}</b></span>
        <form action={signOutAction}><button className="abtn sm side-btn" type="submit">Sign out</button></form>
        <a href="/" style={{ color: "#c9cde4", fontSize: 15.5 }}>View the website</a></div>
    </aside>
    <main className="main">{children}</main>
  </div></div>;
}
