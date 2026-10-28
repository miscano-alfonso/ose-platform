"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** Reloads the page's data every so often (e.g. arrivals during a live lesson). */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return null;
}
