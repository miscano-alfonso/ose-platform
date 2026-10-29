import { NextResponse, type NextRequest } from "next/server";
import * as N from "@/lib/newsletter";
import { siteBase } from "@/lib/social";

// Public newsletter links: the footer sign-up, the confirm and unsubscribe links in emails, and the open/click tracking
// for emails copied or downloaded from the Newsletter builder. Reachable even while the preview password is on.
export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const html = (s: string, status = 200) => new NextResponse(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
const ipOf = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
async function base(req: NextRequest) { return (await siteBase().catch(() => "")) || req.nextUrl.origin; }

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "subscribe" || req.headers.get("x-ose-form") !== "1") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try { return NextResponse.json(await N.subscribe((await req.json().catch(() => ({}))) as Record<string, unknown>, ipOf(req), await base(req))); }
  catch (e) { return NextResponse.json({ error: e instanceof N.NlError ? e.message : "Something went wrong. Please try again." }, { status: e instanceof N.NlError ? e.status : 500 }); }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params; const sp = req.nextUrl.searchParams; const b = await base(req);
  const look = action === "confirm" || action === "unsubscribe" ? await N.schoolLook() : undefined;
  if (action === "confirm") {
    const ok = await N.confirmToken(sp.get("t") || "").catch(() => false);
    return html(ok ? N.simplePage(b, "You’re subscribed", "Thank you. We’ll email you about space in our classes, new courses and workshops a few times a term. Every email has a link to unsubscribe.", "Back to the website", b + "/", true, look)
      : N.simplePage(b, "That link has expired", "Please sign up again from the bottom of any page on our website.", "Back to the website", b + "/", true, look), ok ? 200 : 404);
  }
  if (action === "unsubscribe") {
    await N.unsubscribeToken(sp.get("t") || "").catch(() => {});
    return html(N.simplePage(b, "You’ve been unsubscribed", `You won’t receive any more newsletters from ${look!.school}. If that was a mistake, you can sign up again at the bottom of any page on our website.`, "Back to the website", b + "/", true, look));
  }
  if (action === "o" || action === "c") {
    const who = ipOf(req) + "|" + (req.headers.get("user-agent") || "");
    await N.recordEvent(action, sp.get("e") || "", sp.get("s") || "", who, action === "c" ? sp.get("l") || "" : "");
    if (action === "c") return NextResponse.redirect(N.clickTarget(sp.get("u") || "", b), { status: 302, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
    return new NextResponse(new Uint8Array(GIF), { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate", "x-robots-tag": "noindex" } });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
