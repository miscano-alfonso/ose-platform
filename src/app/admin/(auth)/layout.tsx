import type { Metadata } from "next";
import "../admin.css";
import { brandSrc } from "@/lib/brand";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { logo } = await brandSrc();
  return <main className="adm-auth"><div className="box">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={logo} alt="OH-SO ED Online School" width={773} height={224} />
    {children}
  </div></main>;
}
