"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { requireParent, requireStudent } from "@/lib/family-auth";
import { feedUrl } from "@/lib/calendar-feed";

/** "Make a new address": replaces the signed-in person's calendar address (the old one stops working). */
export async function calendarNewLinkAction(f: FormData): Promise<void> {
  const area = String(f.get("area") ?? "");
  if (area === "teacher") { const me = await requireViewer(); await feedUrl({ kind: "staff", id: me.id }, true); redirect("/admin/teacher/calendar?ok=new"); }
  if (area === "parent") { const p = await requireParent(); if (p.viewer) redirect("/parent/calendar"); await feedUrl({ kind: "parent", id: p.id }, true); redirect("/parent/calendar?ok=new"); }
  if (area === "student") { const s = await requireStudent(); if (s.viewer) redirect("/student/calendar"); await feedUrl({ kind: "student", id: s.id }, true); redirect("/student/calendar?ok=new"); }
}
