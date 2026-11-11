import { NextResponse, type NextRequest } from "next/server";
import { currentFamily } from "@/lib/family-auth";
import { finishSetup } from "@/lib/stripe-pay";

export const dynamic = "force-dynamic";

// 11 Nov: Stripe's secure page sends the parent back here after setting up Direct Debit (or a card). The set-up is saved
// only for the family it was started for.
export async function GET(req: NextRequest) {
  const f = await currentFamily().catch(() => null);
  const back = (q: string) => NextResponse.redirect(new URL(`/parent/payments?${q}`, req.nextUrl.origin), 302);
  if (!f || f.kind !== "parent" || f.viewer) return NextResponse.redirect(new URL("/account", req.nextUrl.origin), 302);
  const err = await finishSetup(req.nextUrl.searchParams.get("session") ?? "", f.id).catch(() => "Something went wrong saving it. Please try again.");
  return back(err ? `err=${encodeURIComponent(err)}` : `ok=${encodeURIComponent("Thank you. That’s set up for your termly payments.")}#how`);
}
