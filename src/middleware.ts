import { NextResponse, type NextRequest } from "next/server";

// While SITE_PASSWORD is set (the private test site), every page asks for it and
// search engines are told not to index anything. Remove the variable at launch.
export function middleware(req: NextRequest) {
  const pass = process.env.SITE_PASSWORD;
  if (!pass) return NextResponse.next();
  // pictures and link previews that Facebook and Instagram fetch for Social posts stay reachable
  if (/^\/(social-img|s|teacher-photo|brand)\/|^\/teachers\/[\w.-]+\.(webp|jpe?g|png)$/.test(req.nextUrl.pathname)) return NextResponse.next();
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

function timingSafeEqual(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
