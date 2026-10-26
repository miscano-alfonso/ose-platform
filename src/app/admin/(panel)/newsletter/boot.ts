import "server-only";
import { headers } from "next/headers";
import { socialItems, siteBase } from "@/lib/social";

/** What the newsletter pages need: the courses and workshops (for the course blocks) and the site's address. */
export async function newsletterBoot() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const [items, base] = await Promise.all([socialItems(), siteBase(origin)]);
  return { items, base };
}
