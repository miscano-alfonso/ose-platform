import type { Metadata } from "next";
import "../admin.css";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="adm-auth"><div className="box">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/ose-logo.png" alt="OH-SO ED Online School" width={773} height={224} />
    {children}
  </div></main>;
}
