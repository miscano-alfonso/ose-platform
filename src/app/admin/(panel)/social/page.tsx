import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { socialItems, siteBase } from "@/lib/social";
import { getTerms } from "@/lib/data";
import { brandSrc } from "@/lib/brand";
import { SocialApp } from "./SocialApp";
import "./social.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Social" };

export default async function SocialPage() {
  await requireStaff();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const [items, base, brand, allTerms] = await Promise.all([socialItems(), siteBase(origin), brandSrc(), getTerms().catch(() => [])]);
  const today = new Date().toISOString().slice(0, 10);
  const terms = allTerms.filter((t) => t.ends_on >= today).slice(0, 4).map((t) => ({ name: `${t.name} ${t.year_label}`, starts: t.starts_on, ends: t.ends_on, breakStart: t.break_start, breakEnd: t.break_end }));
  return <SocialApp boot={{ items, base, logo: brand.logo, icon: brand.icon, terms }} />;
}
