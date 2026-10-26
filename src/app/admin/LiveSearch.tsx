"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Search box that filters as you type (like the prototype): keeps the other filters in the address and updates ?q= after a short pause.
export default function LiveSearch({ placeholder, label, width = 280, param = "q" }: { placeholder: string; label?: string; width?: number; param?: string }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [v, setV] = useState(sp.get(param) ?? "");
  const [pending, start] = useTransition();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const go = (val: string) => {
    const p = new URLSearchParams(sp.toString());
    if (val.trim()) p.set(param, val.trim()); else p.delete(param);
    p.delete("ok"); p.delete("err");
    const qs = p.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  };
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const change = (val: string) => { setV(val); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => go(val), 180); };
  return <div className="lsearch" style={{ position: "relative", width, maxWidth: "100%" }}>
    <input type="text" value={v} onChange={(e) => change(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") change(""); if (e.key === "Enter") { e.preventDefault(); if (t.current) clearTimeout(t.current); go(v); } }}
      placeholder={placeholder} aria-label={label ?? placeholder} className="mini" autoComplete="off" spellCheck={false} data-lpignore="true"
      style={{ width: "100%", paddingRight: 30, opacity: pending ? 0.75 : 1 }} />
    {v && <button type="button" onClick={() => change("")} aria-label="Clear search" title="Clear"
      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>}
  </div>;
}
