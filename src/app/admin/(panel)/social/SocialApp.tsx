"use client";
import { useEffect, useRef } from "react";
import type { SocialItem } from "@/lib/social";
import { mountSocial } from "./social-app.js";

export function SocialApp({ boot }: { boot: { items: SocialItem[]; base: string; logo: string; icon: string } }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.createElement("div"); // a fresh element each time, so its listeners go with it
    host.current?.appendChild(el);
    mountSocial(el, boot);
    return () => { el.remove(); document.getElementById("soc-toast")?.remove(); };
  }, [boot]);
  return <div ref={host} className="soc-host" />;
}
