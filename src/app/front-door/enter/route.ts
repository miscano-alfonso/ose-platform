import { NextResponse, type NextRequest } from "next/server";
import { FRONT_COOKIE, frontPassword, frontToken, sameText, safeNext } from "@/lib/front-door";

// POST from /front-door: the right password sets the front-door cookie (30 days) and goes on to where they were heading.
export async function POST(req: NextRequest) {
  const f = await req.formData().catch(() => null);
  const next = safeNext(f?.get("next")), given = String(f?.get("password") ?? "");
  const pass = frontPassword();
  const back = (p: string) => NextResponse.redirect(new URL(p, req.url), 303);
  if (!pass) return back(next);
  if (!sameText(given, pass)) {
    await new Promise((r) => setTimeout(r, 700));   // slows down guessing
    return back(`/front-door?e=1&next=${encodeURIComponent(next)}`);
  }
  const res = back(next);
  res.cookies.set(FRONT_COOKIE, await frontToken(pass), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return res;
}
