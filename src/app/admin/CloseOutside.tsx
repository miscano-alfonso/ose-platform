"use client";
import { useEffect } from "react";

// Closes open <details> pop-ups (e.g. the timetable's lesson cards) when you click anywhere else or press Escape (5 Nov).
export function CloseOutside({ selector }: { selector: string }) {
  useEffect(() => {
    const shut = (keep?: Node | null) => document.querySelectorAll<HTMLDetailsElement>(`${selector}[open]`).forEach((d) => { if (!keep || !d.contains(keep)) d.open = false; });
    const click = (e: MouseEvent) => shut(e.target as Node);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") shut(); };
    document.addEventListener("click", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, [selector]);
  return null;
}
