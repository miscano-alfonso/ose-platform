"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SpaceCourse } from "@/lib/data";

// "Space Available" carousel: swipe or use the dots. Cards are chosen in Admin → Classes (Space Available on homepage).
export function SpaceAvailable({ items, roundels }: { items: SpaceCourse[]; roundels: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1), [page, setPage] = useState(0);
  useEffect(() => {
    const el = track.current; if (!el) return;
    const measure = () => { setPages(Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.05))); setPage(Math.round(el.scrollLeft / el.clientWidth)); };
    measure(); el.addEventListener("scroll", measure, { passive: true }); window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [items.length]);
  const go = (p: number) => track.current?.scrollTo({ left: p * track.current.clientWidth, behavior: "smooth" });
  return (
    <section className="s-sec space"><div className="wrap">
      <h2 className="space-h">Space Available</h2>
      <div className="space-track" ref={track}>
        {items.map((c, i) => (
          <Link key={c.code} href={`/courses?year=${encodeURIComponent(c.year_label)}&level=${encodeURIComponent(c.level)}`} className="space-card">
            <span className="roundel" style={{ ["--c" as string]: c.colour }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={roundels[i]} alt="" width={100} height={100} />
            </span>
            <span className="space-lvl">{c.level}<span className="sr-only"> {c.subject}</span></span>
          </Link>
        ))}
      </div>
      {pages > 1 && <div className="space-dots" role="group" aria-label="Pages">
        {Array.from({ length: pages }, (_, p) => <button key={p} type="button" aria-label={`Page ${p + 1}`} aria-current={p === page} onClick={() => go(p)} />)}
      </div>}
    </div></section>
  );
}
