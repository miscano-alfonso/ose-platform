import { NextResponse, type NextRequest } from "next/server";

// While SITE_PASSWORD is set (the private test site), every page asks for it and
// search engines are told not to index anything. Remove the variable at launch.
export async function middleware(req: NextRequest) {
  const pass = process.env.SITE_PASSWORD;
  if (!pass) return NextResponse.next();
  // pictures and link previews that Facebook and Instagram fetch for Social posts stay reachable
  if (/^\/api\/cron\/|^\/(social-img|s|newsletter|teacher-photo|brand)\/|^\/teachers\/[\w.-]+\.(webp|jpe?g|png)$/.test(req.nextUrl.pathname)) return NextResponse.next();
  // OH-SO EdTech's own site is public; its demo visitors can open the dashboard and family pages of the demo school
  if (/^\/osedtech(\/|$)/.test(req.nextUrl.pathname)) return robots(NextResponse.next());
  if (/^\/(admin|parent|student)(\/|$)/.test(req.nextUrl.pathname) && await demoCookieOk(req.cookies.get("ose_demo")?.value, pass)) return robots(NextResponse.next());
  const auth = req.headers.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const given = atob(encoded).split(":").slice(1).join(":");
    if (given.length === pass.length && timingSafeEqual(given, pass)) {
      const res = NextResponse.next();
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }
  }
  return new NextResponse("Private preview", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OH-SO ED preview", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow" },
  });
}

function robots(res: NextResponse) { res.headers.set("X-Robots-Tag", "noindex, nofollow"); return res; }
/** The demo cookie is an HMAC of "ose-demo" keyed with the preview password, so it can't be made up. */
async function demoCookieOk(v: string | undefined, pass: string): Promise<boolean> {
  if (!v) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("ose-demo")));
  const want = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return v.length === want.length && timingSafeEqual(v, want);
}

function timingSafeEqual(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
