import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { studioData, canvaStatus } from "@/lib/designs";
import { siteBase, aiReady } from "@/lib/social";
import { withSchool } from "@/lib/db";
import Studio from "./Studio";
import "./designs.css";

export const dynamic = "force-dynamic";

// Social → New post → "More designs": the 16 Facebook-style designs. The Canva connection and library now live in Social.
export default async function Designs({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string; purpose?: string }> }) {
  const sp = await searchParams;
  if (sp.tab === "library") redirect(`/admin/social?view=pictures${sp.ok ? `&ok=${encodeURIComponent(sp.ok)}` : ""}${sp.err ? `&err=${encodeURIComponent(sp.err)}` : ""}`);
  const h = await headers(); const base = await siteBase(`${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`);
  const [data, canva, brand] = await Promise.all([studioData(), canvaStatus(base),
    withSchool((q) => q<{ brand: { primary?: string } }>(`select brand from schools where id = current_school()`)).then((r) => r[0]?.brand ?? {})]);
  const navy = typeof brand.primary === "string" && /^#[0-9a-f]{6}$/i.test(brand.primary) ? brand.primary : "#141a5c";
  return <>
    <div className="top"><div><p style={{ margin: "0 0 4px" }}><Link href="/admin/social">← Social</Link></p><h1>More designs</h1><div className="sub">The Facebook-style designs, for a post that wants a different look from your picture template. Pick a design, change the words, then post it from Social or download it. Pictures come from your library and Canva (Social → Pictures &amp; Canva).</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <Studio data={data} navy={navy} canva={canva.connected} purpose={sp.purpose} ai={await aiReady().catch(() => false)} />
  </>;
}
