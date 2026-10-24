import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Private preview: nothing is indexed until SITE_PASSWORD is removed at launch.
  if (process.env.SITE_PASSWORD) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" } };
}
