"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { money } from "@/lib/format";
import { CART_COOKIE, COUPON_COOKIE, cartCodes, cartValue, cartQuote } from "@/lib/cart";
import { currentFamily } from "@/lib/family-auth";
import { familyChildren } from "@/lib/registration";

const keep = { path: "/", sameSite: "lax" as const, httpOnly: false, secure: process.env.VERCEL === "1", maxAge: 60 * 60 * 24 * 30 };

/** Adds a class to the basket (from a course card or course page); returns how many courses are in it now. */
export async function addToCart(code: string): Promise<number> {
  if (!/^[\w/-]{1,40}$/.test(code)) return (await cartCodes()).length;
  const codes = [...(await cartCodes()).filter((c) => c !== code), code];
  (await cookies()).set(CART_COOKIE, cartValue(codes), keep);
  revalidatePath("/", "layout");
  return codes.length;
}

export async function removeFromCart(form: FormData) {
  const code = String(form.get("code") ?? "");
  (await cookies()).set(CART_COOKIE, cartValue((await cartCodes()).filter((c) => c !== code)), keep);
  redirect("/cart");
}

export async function applyCoupon(form: FormData) {
  const code = String(form.get("coupon") ?? "").trim().slice(0, 40);
  const jar = await cookies();
  if (!code) { jar.delete(COUPON_COOKIE); redirect("/cart"); }
  jar.set(COUPON_COOKIE, code, keep);
  const q = await cartQuote();
  if (!q.coupon) { jar.delete(COUPON_COOKIE); redirect(`/cart?error=${encodeURIComponent("That coupon code isn’t valid.")}#checkout`); }
  redirect("/cart#checkout");
}

/** Checkout: only for a registered, signed-in parent, with each course given to one of their children. Until card payment is switched on,
 *  the booking is saved for the office (Admin → Enquiries), who confirm the places and email a payment link. */
export async function checkout(form: FormData) {
  const v = (k: string, n = 200) => String(form.get(k) ?? "").trim().slice(0, n);
  const back = (m: string) => redirect(`/cart?error=${encodeURIComponent(m)}#checkout`);
  const fam = await currentFamily();
  if (!fam || fam.kind !== "parent") return back("Register or sign in to check out.");
  if (fam.viewer) return back("You’re viewing as this family, so nothing can be booked.");
  const q = await cartQuote();
  if (!q.lines.length) return back("Your basket is empty.");
  if (v("terms") !== "1") return back("Please agree to the Terms & Conditions.");
  const kids = new Map((await familyChildren(fam.id)).map((k) => [k.id, k.name]));
  const who = q.lines.map((l) => kids.get(v(`who:${l.code}`, 40)));
  if (who.some((w) => !w)) return back("Choose the student for each course.");
  const spread = v("spread") === "1";
  const lines = q.lines.map((l, i) => `${l.level} ${l.subject} (${l.code}) for ${who[i]}: ${money(l.netPence)}${l.discountPence ? ` after ${money(l.discountPence)} bundle discount` : ""}`);
  const message = [...lines,
    q.coupon ? `Coupon ${q.coupon.code}: −${money(q.coupon.pence)}` : "",
    `Courses ${money(q.totalPence)} + registration fees ${money(q.feesPence)} = ${money(q.payPence)}`,
    spread ? `Wants to spread the cost: about ${money(q.perTermPence)} a term over ${q.terms} terms, plus fees` : "Paying in full",
    v("message", 1500) ? `Note: ${v("message", 1500)}` : ""].filter(Boolean).join("\n");
  await withSchool((db) => db(`insert into enquiries (school_id, kind, name, email, child_name, subject, levels, message)
    values (current_school(), 'booking', $1, $2, $3, $4, $5, $6)`,
    [`${fam.first} ${fam.last}`, fam.email, [...new Set(who)].join(", "), `${q.lines.length} course${q.lines.length > 1 ? "s" : ""} · ${money(q.payPence)}`, [...new Set(q.lines.map((l) => l.level))], message]));
  const jar = await cookies(); jar.delete(CART_COOKIE); jar.delete(COUPON_COOKIE);
  redirect("/cart?sent=1");
}
