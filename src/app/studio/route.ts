import { NextResponse, type NextRequest } from "next/server";
import { STUDIO_HTML } from "@/lib/studio-page";
import { STUDIO_COOKIE, studioCookieOk, studioPasswordOk, studioToken } from "@/lib/studio";

// ose…/studio (4 Nov): Sketch Studio for anyone with the studio password ("ose" unless STUDIO_PASSWORD is set). No admin sign-in.
export const dynamic = "force-dynamic";
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.has("lock")) {
    const r = NextResponse.redirect(new URL("/studio", req.url), 303); r.cookies.delete({ name: STUDIO_COOKIE, path: "/studio" }); return r;
  }
  if (!studioCookieOk(req.cookies.get(STUDIO_COOKIE)?.value)) return html(passwordPage());
  return html(STUDIO_HTML);
}
export async function POST(req: NextRequest) {
  const f = await req.formData().catch(() => null);
  if (!studioPasswordOk(String(f?.get("password") ?? ""))) {
    await new Promise((ok) => setTimeout(ok, 1200));   // slows down guessing
    return html(passwordPage(true), 401);
  }
  const r = NextResponse.redirect(new URL("/studio", req.url), 303);
  r.cookies.set(STUDIO_COOKIE, studioToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/studio", maxAge: 30 * 86400 });
  return r;
}

function passwordPage(wrong = false) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>OH-SO ED Sketch Studio</title><link rel="icon" href="/ose-icon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500&display=swap">
<style>
:root { --bg: #F2F4F9; --surface: #FFFFFF; --ink: #0F1747; --muted: #4C567A; --line: #D6DCEA; --accent: #1E4C96; --accent-ink: #FFFFFF; --warn: #9A3B1E; color-scheme: light }
@media (prefers-color-scheme: dark) { :root { --bg: #050C22; --surface: #0C1534; --ink: #E7EEFB; --muted: #9EADD0; --line: #223061; --accent: #68BBE4; --accent-ink: #04102D; --warn: #F0A285; color-scheme: dark } }
* { box-sizing: border-box } body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 400 16px/1.5 "Jost", "Avenir Next", "Segoe UI", sans-serif; padding: 24px max(16px, env(safe-area-inset-left, 0px)) }
form { width: min(380px, 100%); background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 28px; display: grid; gap: 14px }
h1 { font: 500 28px/1.1 "Jost", sans-serif; margin: 0 } p { margin: 0; color: var(--muted) }
label { font: 500 13px/1 "Jost", sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--muted) }
input { width: 100%; font: 400 17px/1.3 "Jost", sans-serif; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; margin-top: 8px }
input:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
button { font: 500 16px/1 "Jost", sans-serif; background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 10px; padding: 13px; cursor: pointer }
.err { color: var(--warn) }
</style></head><body>
<form method="post" action="/studio" autocomplete="off">
  <h1>OH-SO ED Sketch Studio</h1>
  <p>Enter the studio password to start drawing.</p>
  <label for="pw">Password<input id="pw" name="password" type="password" required autofocus autocomplete="current-password"></label>
  ${wrong ? `<p class="err" role="alert">That password isn’t right. Try again.</p>` : ""}
  <button type="submit">Open the studio</button>
</form></body></html>`;
}
