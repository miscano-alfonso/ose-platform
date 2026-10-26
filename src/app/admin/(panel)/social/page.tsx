import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { socialItems, siteBase } from "@/lib/social";
import { brandSrc } from "@/lib/brand";
import { SocialApp } from "./SocialApp";
import "./social.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Social" };

export default async function SocialPage() {
  await requireStaff();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const [items, base, brand] = await Promise.all([socialItems(), siteBase(origin), brandSrc()]);
  return <SocialApp boot={{ items, base, logo: brand.logo, icon: brand.icon }} />;
}
