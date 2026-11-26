"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 26 Nov: the menu's counts are drawn by the layout, which isn't redrawn when moving between pages, so after reading a
// message the Messages badge could stay at 1. A page that knows the right number passes it here; if the menu shows a
// different one, the page is refreshed once so the menu catches up.
export function NavCountSync({ href, count }: { href: string; count: number }) {
  const router = useRouter();
  useEffect(() => {
    const a = document.querySelector(`nav.nav a[href="${href}"]`);
    if (!a) return;
    const shown = Number(a.querySelector(".cnt")?.textContent ?? 0) || 0;
    if (shown !== count) router.refresh();
  }, [href, count, router]);
  return null;
}
