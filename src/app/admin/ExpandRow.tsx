"use client";
import type { ReactNode } from "react";

// 28 Nov (Alfonso: "rather than this button and taking up space, can the row tint on hover and expand on click?"):
// a table row that opens the edit form in the row below it (a <details> there). Clicks on its own buttons and links
// (e.g. Connect Classroom) are left alone. The <summary> stays for keyboard users, visually hidden.
export function ExpandRow({ target, label, children }: { target: string; label: string; children: ReactNode }) {
  // 28 Nov: one open at a time: opening a row closes the others
  const toggle = () => { const d = document.getElementById(target) as HTMLDetailsElement | null; if (!d) return;
    if (!d.open) document.querySelectorAll<HTMLDetailsElement>("details.edit[open]").forEach((x) => { if (x !== d) x.open = false; });
    d.open = !d.open; };
  return <tr className="xrow" title={label} onClick={(e) => { if ((e.target as Element).closest("a,button,input,select,textarea,dialog,label")) return; toggle(); }}>{children}</tr>;
}
