"use client";
import { useEffect, useRef } from "react";
import type { SocialItem } from "@/lib/social";
import { mountNewsletter } from "./newsletter-app.js";

export function NewsletterApp({ boot, page }: { boot: { items: SocialItem[]; base: string }; page: "email" | "subscribers" | "stats" }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.createElement("div"); // a fresh element each time, so its listeners go with it
    el.id = "nl";
    host.current?.appendChild(el);
    mountNewsletter(el, boot, page);
    return () => { el.remove(); document.getElementById("nl-toast")?.remove(); };
  }, [boot, page]);
  return <div ref={host} />;
}
