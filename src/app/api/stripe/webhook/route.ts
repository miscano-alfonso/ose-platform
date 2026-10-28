import { type NextRequest } from "next/server";
import { stripeWebhook } from "@/lib/stripe-read";

// Stripe's notifications (charge succeeded / failed / refunded). Checked against the signing secret, recorded, and
// matched to families' terms. Nothing is ever sent back to Stripe.
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const r = await stripeWebhook(raw, req.headers.get("stripe-signature")).catch((e) => { console.error("stripe webhook", e); return { status: 500, body: "error" }; });
  return new Response(r.body, { status: r.status });
}
