"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// A table row that opens a page when clicked anywhere (5 Nov). Links and buttons inside it keep working as themselves;
// the row's first link is the keyboard/screen-reader way in.
export function RowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return <tr className={`row-link${className ? ` ${className}` : ""}`} onClick={(e) => {
    if ((e.target as HTMLElement).closest("a,button,summary,input,select,label") || window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank"); else router.push(href);
  }}>{children}</tr>;
}
