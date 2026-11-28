import { NextResponse, type NextRequest } from "next/server";
import { FRONT_COOKIE, frontPassword, frontToken, sameText } from "@/lib/front-door";

// While SITE_PASSWORD is set (the test period) search engines are told not to index anything; remove the variable at launch.
// (Until 31 Oct it also put a password prompt in front of the dashboards; that prompt is now off, see below.)
// OH-SO EdTech (/osedtech) is public, and its demo visitors (a signed "ose_demo" cookie) can open the demo school's
// dashboard, family pages and public website. Self-serve trial customers (a signed "ose_trial" cookie) can open /admin. The demo website is chosen here with the x-ose-site header, which is
// always removed from what the browser sends, so it can only come from a valid demo cookie.
const DEMO_SITES = ["demo-academy", "demo-solo"];   // Demo Academy and the Solo demo (28 Nov)
const demoKey = () => process.env.SITE_PASSWORD || process.env.ADMIN_SETUP_KEY || "";

// 26 Nov: the platform moved from ose.miscano.co.uk to dev.ohsoed.co.uk. Once SITE_URL names the new address, page visits
// to the old one are sent there (same path and query). /api/ (Stripe webhook, cron jobs, sign-in callbacks) and form posts
// still work on the old address until each of those services has been pointed at the new one.
const OLD_HOSTS = ["ose.miscano.co.uk"];
function moved(req: NextRequest): NextResponse | null {
  const site = process.env.SITE_URL; if (!site) return null;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase().split(":")[0];
  if (!OLD_HOSTS.includes(host) || (req.method !== "GET" && req.method !== "HEAD") || req.nextUrl.pathname.startsWith("/api/")) return null;
  let to: URL; try { to = new URL(req.nextUrl.pathname + req.nextUrl.search, site); } catch { return null; }
  return to.hostname === host ? null : NextResponse.redirect(to, 308);
}

// 26 Nov: while FRONT_PASSWORD is set, every page needs that password first (/front-door; cookie ose_front, 30 days).
// Left open: the password page, Stripe and cron (/api/), calendar feeds, lesson join links and the pictures/links
// that Facebook, Instagram and emails fetch.
const OPEN = /^\/(front-door|api)(\/|$)|^\/(social-img|s|newsletter|teacher-photo|people-photo|workshop-image|brand|join|cal)\/|^\/teachers\/[\w.-]+\.(webp|jpe?g|png)$|^\/ose-(logo|logo-blue|logo-white|logo-duo|icon)\.(png|svg)$|^\/robots\.txt$/;
async function frontDoor(req: NextRequest): Promise<NextResponse | null> {
  const pass = frontPassword(); if (!pass) return null;
  const path = req.nextUrl.pathname;
  if (OPEN.test(path)) return null;
  const have = req.cookies.get(FRONT_COOKIE)?.value;
  if (have && sameText(have, await frontToken(pass))) return null;
  if (req.method !== "GET" && req.method !== "HEAD") return new NextResponse("Password needed", { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  const to = new URL("/front-door", req.url); to.searchParams.set("next", path + req.nextUrl.search);
  const res = NextResponse.redirect(to, 307); res.headers.set("X-Robots-Tag", "noindex, nofollow"); res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function middleware(req: NextRequest) {
  const gone = moved(req); if (gone) return gone;
  const shut = await frontDoor(req); if (shut) return shut;
  const path = req.nextUrl.pathname;
  const hdrs = new Headers(req.headers); hdrs.delete("x-ose-site");
  hdrs.set("x-ose-path", path);   // for the admin layout ("not in your plan")
  // 26 Nov: Page styles previews a teacher/parent/student dashboard as a real person (?ose_preview=t:<id>|p:<id>|s:<id>);
  // only honoured for a signed-in admin (auth.ts / family-auth.ts), and never taken from the browser's own headers
  hdrs.delete("x-ose-preview");
  const pv = req.nextUrl.searchParams.get("ose_preview");
  if (pv && ((/^t:[0-9a-f-]{36}$/.test(pv) && /^\/admin\/teacher(\/|$)/.test(path)) || (/^f:[A-Za-z0-9_-]{40,60}$/.test(pv) && /^\/(parent|student)(\/|$)/.test(path)))) hdrs.set("x-ose-preview", pv);
  const next = () => NextResponse.next({ request: { headers: hdrs } });
  const key = demoKey(), pass = process.env.SITE_PASSWORD;
  const demo = key ? await demoCookieOk(req.cookies.get("ose_demo")?.value, key) : false;
  const familyOrAdmin = /^\/(admin|parent|student)(\/|$)/.test(path);
  // the demo school's own website, for demo visitors who opened it
  if (demo && !familyOrAdmin && !/^\/osedtech(\/|$)/.test(path) && DEMO_SITES.includes(req.cookies.get("ose_site")?.value ?? "")) {
    hdrs.set("x-ose-site", req.cookies.get("ose_site")!.value);
    return robots(next());
  }
  if (!pass) return next();
  // pictures and link previews that Facebook and Instagram fetch for Social posts stay reachable
  if (/^\/api\/cron\/|^\/api\/stripe\/webhook$|^\/(social-img|s|newsletter|teacher-photo|people-photo|workshop-image|brand|join|cal)\/|^\/teachers\/[\w.-]+\.(webp|jpe?g|png)$|^\/ose-(logo|logo-blue|logo-white|logo-duo|icon)\.(png|svg)$/.test(path)) return next();
  // 31 Oct: the preview password is off everywhere. The website and the dashboards are open; the dashboards still need each
  // person's own sign-in (admin, parent, student), and nothing is indexed by search engines while SITE_PASSWORD is set.
  return robots(next());
}

function robots(res: NextResponse) { res.headers.set("X-Robots-Tag", "noindex, nofollow"); return res; }
/** The demo cookie is an HMAC of "ose-demo", keyed with the preview password (or the admin set-up key), so it can't be made up. */
async function demoCookieOk(v: string | undefined, key: string): Promise<boolean> {
  if (!v) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("ose-demo")));
  const want = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return v.length === want.length && timingSafeEqual(v, want);
}

function timingSafeEqual(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
