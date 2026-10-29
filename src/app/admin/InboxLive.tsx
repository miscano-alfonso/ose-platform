"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { inboxTickAction } from "./actions";

// Keeps the open Inbox in step with Gmail: every minute (while the tab is visible) it checks for new emails and for
// emails read or unread in Mail, then refreshes the list.
export function InboxLive() {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const tick = async () => { if (busy || document.hidden) return; busy = true; try { const r = await inboxTickAction(); if (r.changed) router.refresh(); } finally { busy = false; } };
    const t = window.setInterval(tick, 60e3);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [router]);
  return null;
}
