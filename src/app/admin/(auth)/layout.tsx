import type { Metadata } from "next";
import "../admin.css";
import { brandSrc } from "@/lib/brand";
import { siteInfo, isPlatformSchool } from "@/lib/db";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [{ logo, custom }, site, own] = await Promise.all([brandSrc(), siteInfo(), isPlatformSchool()]);
  return <main className="adm-auth"><div className="box">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {own || custom.logo ? <img src={logo} alt={own ? "OH-SO ED Online School" : site.name} width={773} height={224} /> : <p style={{ font: "600 26px/1.15 Jost, sans-serif", letterSpacing: ".05em", textTransform: "uppercase", margin: "0 0 18px" }}>{site.name}</p>}
    {children}
  </div></main>;
}
