import { NextResponse, type NextRequest } from "next/server";

// While SITE_PASSWORD is set (the test period), the dashboards (/admin, /parent, /student) ask for it and search
// engines are told not to index anything. The public website is open. Remove the variable at launch.
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
  // the public website is open to everyone (still not indexed while SITE_PASSWORD is set); only the dashboards ask for it
  if (!familyOrAdmin) return robots(next());
  if (familyOrAdmin && demo) return robots(next());
  // OH-SO EdTech customers on a trial: their own school's dashboard (the cookie is signed, and they still need their sign-in)
  // (only for that school: anyone can start a trial, so the cookie never opens OH-SO ED's own sign-in page)
  if (/^\/admin(\/|$)/.test(path) && key) {
    const t = await trialCookieSlug(req.cookies.get("ose_trial")?.value, key);
    if (t && req.cookies.get("ose_school")?.value === t) return robots(next());
  }
  const auth = req.headers.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const given = atob(encoded).split(":").slice(1).join(":");
    if (given.length === pass.length && timingSafeEqual(given, pass)) return robots(next());
  }
  return new NextResponse("Private preview", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OH-SO ED preview", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow" },
  });
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

/** "slug.signature": made when someone opens or signs in to their trial school (src/lib/edtech-account.ts). */
async function trialCookieSlug(v: string | undefined, key: string): Promise<string | null> {
  const m = /^([a-z0-9-]{2,40})\.([\w-]{20,80})$/.exec(v ?? ""); if (!m) return null;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`ose-trial:${m[1]}`)));
  const want = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return m[2].length === want.length && timingSafeEqual(m[2], want) ? m[1] : null;
}

function timingSafeEqual(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
