"use client";
import { Children, useState, type ReactNode } from "react";

/** A list that shows the first few items, with "Show N more" to open the rest in a scrolling box (and "Show fewer"). */
export function MoreList({ children, limit = 5, className, as: Tag = "div" }: { children: ReactNode; limit?: number; className?: string; as?: "div" | "ol" | "ul" }) {
  const all = Children.toArray(children), [open, setOpen] = useState(false);
  const extra = all.length - limit;
  return <>
    <Tag className={`${className ?? ""}${open && extra > 0 ? " ml-open" : ""}`}>{open ? all : all.slice(0, limit)}</Tag>
    {extra > 0 && <button type="button" className="ml-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show fewer" : `Show ${extra} more`}</button>}
  </>;
}
