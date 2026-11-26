import type { Metadata } from "next";
import "../admin.css";
import { brandSrc } from "@/lib/brand";
import { siteInfo, isPlatformSchool } from "@/lib/db";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [{ logo, custom }, site, own] = await Promise.all([brandSrc(), siteInfo(), isPlatformSchool()]);
  // 26 Nov: the logo sits above the white box, on the navy page (OH-SO ED's white-and-blue logo)
  return <main className="adm-auth"><div className="auth-wrap">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {own ? <img className="auth-logo" src="/ose-logo-duo.svg" alt="OH-SO ED Online School" width={773} height={224} />
      : custom.logo ? <img className="auth-logo chip" src={logo} alt={site.name} width={773} height={224} />
      : <p className="auth-name">{site.name}</p>}
    <div className="box">{children}</div>
  </div></main>;
}
