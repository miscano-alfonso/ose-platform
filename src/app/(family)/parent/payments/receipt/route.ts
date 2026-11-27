import { NextResponse, type NextRequest } from "next/server";
import { requireParent } from "@/lib/family-auth";
import { paymentHistory } from "@/lib/family";

// 27 Nov (Alfonso): Payments → Payment history → Receipt: opens Stripe's receipt for one of this family's payments.
export async function GET(req: NextRequest) {
  const f = await requireParent();
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  const back = (msg: string) => NextResponse.redirect(new URL(`/parent/payments?err=${encodeURIComponent(msg)}#history`, req.url));
  // only a payment that's in this family's own history
  if (!(await paymentHistory(f.id)).some((h) => h.ref === ref)) return back("That receipt isn’t one of your payments.");
  const { receiptFor } = await import("@/lib/stripe-read");
  let url = await receiptFor(ref).catch(() => null);
  if (!url && ref.startsWith("pi_")) url = await import("@/lib/stripe-pay").then((m) => m.payReceipt(ref)).catch(() => null);
  if (!url || !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(url)) return back("Stripe doesn’t have a receipt for that payment. Message us and we’ll send you one.");
  return NextResponse.redirect(url);
}
