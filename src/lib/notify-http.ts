import "server-only";
import { NextResponse } from "next/server";
import { getNotify, saveNotify, notifyEvents, type Who } from "./notify";

// One handler for the three notify-api routes (staff, parent, student): GET ?since=<ms> → settings + events;
// POST { settings } → saved settings. `canSave` is false for an admin who is only viewing as someone.
export async function notifyGet(req: Request, who: Who | null) {
  if (!who) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const since = Number(new URL(req.url).searchParams.get("since"));
  const [settings, events] = await Promise.all([getNotify(who), Number.isFinite(since) && since > 0 ? notifyEvents(who, new Date(since)) : Promise.resolve([])]);
  return NextResponse.json({ settings, events, now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
export async function notifyPost(req: Request, who: Who | null, canSave: boolean) {
  if (!who) return NextResponse.json({ error: "signed out" }, { status: 401 });
  if (!canSave) return NextResponse.json({ error: "You’re viewing as someone else, so their settings can’t be changed." }, { status: 403 });
  const j = (await req.json().catch(() => null)) as { settings?: unknown } | null;
  return NextResponse.json({ settings: await saveNotify(who, j?.settings) });
}
