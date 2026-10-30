import { NextResponse, type NextRequest } from "next/server";

// While SITE_PASSWORD is set (the test period) search engines are told not to index anything; remove the variable at launch.
// (Until 31 Oct it also put a password prompt in front of the dashboards; that prompt is now off, see below.)
// OH-SO EdTech (/osedtech) is public, and its demo visitors (a signed "ose_demo" cookie) can open the demo school's
// dashboard, family pages and public website. Self-serve trial customers (a signed "ose_trial" cookie) can open /admin. The demo website is chosen here with the x-ose-site header, which is
// always removed from what the browser sends, so it can only come from a valid demo cookie.
const DEMO_SITE = "demo-academy";
const demoKey = () => process.env.SITE_PASSWORD || process.env.ADMIN_SETUP_KEY || "";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hdrs = new Headers(req.headers); hdrs.delete("x-ose-site");
  hdrs.set("x-ose-path", path);   // for the admin layout ("not in your plan")
  const next = () => NextResponse.next({ request: { headers: hdrs } });
  const key = demoKey(), pass = process.env.SITE_PASSWORD;
  const demo = key ? await demoCookieOk(req.cookies.get("ose_demo")?.value, key) : false;
  const familyOrAdmin = /^\/(admin|parent|student)(\/|$)/.test(path);
  // the demo school's own website, for demo visitors who opened it
  if (demo && !familyOrAdmin && !/^\/osedtech(\/|$)/.test(path) && req.cookies.get("ose_site")?.value === DEMO_SITE) {
    hdrs.set("x-ose-site", DEMO_SITE);
    return robots(next());
  }
  if (!pass) return next();
  // pictures and link previews that Facebook and Instagram fetch for Social posts stay reachable
  if (/^\/api\/cron\/|^\/api\/stripe\/webhook$|^\/(social-img|s|newsletter|teacher-photo|workshop-image|brand|join|cal)\/|^\/teachers\/[\w.-]+\.(webp|jpe?g|png)$|^\/ose-(logo|logo-blue|logo-white|logo-duo|icon)\.(png|svg)$/.test(path)) return next();
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
