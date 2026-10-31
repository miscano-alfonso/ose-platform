import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import Link from "next/link";
import { socialItems, siteBase } from "@/lib/social";
import { canvaStatus, studioData } from "@/lib/designs";
import { PicturesCanva } from "../designs/PicturesCanva";
import "../designs/designs.css";
import { getTerms } from "@/lib/data";
import { brandSrc } from "@/lib/brand";
import { SocialApp } from "./SocialApp";
import "./social.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Social" };

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; err?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  if (sp.view === "pictures") {
    const [canva, data] = await Promise.all([canvaStatus(await siteBase(origin)), studioData()]);
    return <>
      <p className="backlink"><Link className="abtn sm" href="/admin/social">← Social</Link></p>
    <div className="top"><div><h1>Pictures &amp; Canva</h1><div className="sub">Connect Canva for “From Canva”, and see the illustrations and photos brought in for posts.</div></div></div>
      {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
      <PicturesCanva canva={canva} assets={data.assets} />
    </>;
  }
  const [items, base, brand, allTerms] = await Promise.all([socialItems(), siteBase(origin), brandSrc(), getTerms().catch(() => [])]);
  const today = new Date().toISOString().slice(0, 10);
  const terms = allTerms.filter((t) => t.ends_on >= today).slice(0, 4).map((t) => ({ name: `${t.name} ${t.year_label}`, starts: t.starts_on, ends: t.ends_on, breakStart: t.break_start, breakEnd: t.break_end }));
  return <SocialApp boot={{ items, base, logo: brand.logo, icon: brand.icon, terms }} />;
}
