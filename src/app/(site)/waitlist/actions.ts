"use server";
import { redirect } from "next/navigation";
import { joinWaitlist } from "@/lib/waitlist-join";

export async function joinWaitlistAction(f: FormData) {
  const t = String(f.get("t") ?? "");
  // send "you're on the list" (or, if this family reached the target, "places are open" to everyone on it) straight away
  if (await joinWaitlist(t)) await import("@/lib/automations").then((a) => a.runAutomations(30)).catch((e) => console.error("waiting list emails", e));
  redirect(`/waitlist/join?t=${encodeURIComponent(t)}`);
}
