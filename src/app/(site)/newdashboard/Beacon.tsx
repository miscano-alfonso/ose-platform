"use client";
import { useEffect } from "react";
// counts this page view for Admin → Visitors
export function Beacon({ page }: { page: string }) {
  useEffect(() => { fetch("/newdashboard/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page }), keepalive: true }).catch(() => {}); }, [page]);
  return null;
}
