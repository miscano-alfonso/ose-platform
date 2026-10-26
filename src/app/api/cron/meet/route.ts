import { NextResponse, type NextRequest } from "next/server";
import { meetBackground } from "@/lib/meet";
import { runAutomations } from "@/lib/automations";

// Vercel's daily job (vercel.json): reads new Google Meet joins and sends Friday's attendance alert,
// even when nobody has opened the admin. Vercel sends "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  await meetBackground();
  await runAutomations(400).catch((e) => console.error("automations cron", e)); // books the next 48 hours of lesson reminders with Brevo
  return NextResponse.json({ ok: true });
}
