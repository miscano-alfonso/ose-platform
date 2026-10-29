"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

// The website's links: a page is only fetched when someone is about to open it (pointer over the link, a touch, or
// keyboard focus), instead of Next.js fetching every linked page as soon as its link scrolls into view.
export default function HoverLink({ href, onMouseEnter, onTouchStart, onFocus, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const warm = () => { if (typeof href === "string" && href.startsWith("/")) router.prefetch(href); };
  return <Link {...rest} href={href} prefetch={false}
    onMouseEnter={(e) => { warm(); onMouseEnter?.(e); }} onTouchStart={(e) => { warm(); onTouchStart?.(e); }} onFocus={(e) => { warm(); onFocus?.(e); }} />;
}
