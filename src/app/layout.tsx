import type { Metadata } from "next";
import "./globals.css";
import { brandSrc } from "@/lib/brand";
import { siteInfo } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const [{ icon }, site] = await Promise.all([brandSrc(), siteInfo()]);
  if (site.demo) return { title: { default: `${site.name} | A made-up school on OH-SO EdTech`, template: `%s | ${site.name}` }, robots: { index: false, follow: false }, icons: { icon, apple: icon } };
  return {
  title: { default: "OH-SO ED | Online school for home-educated students", template: "%s | OH-SO ED" },
  description: "Outstanding live online lessons for home-educated students: KS3, pre-GCSE and GCSE courses taught by experienced secondary subject specialists.",
  robots: process.env.SITE_PASSWORD ? { index: false, follow: false } : undefined,
  icons: { icon: icon, apple: icon },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
