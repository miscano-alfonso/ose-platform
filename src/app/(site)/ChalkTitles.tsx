"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HEADER_ART } from "./header-art";

// The floating chalk symbols on each page's title panel. (Page titles and the home headline are back in the site's own
// font: the chalk lettering, with tilted Jost letters, was taken off in update 221 at Leanne's request.)
export function ChalkTitles() {
  const path = usePathname();
  useEffect(() => {
    // a few floating chalk symbols on the right of each title panel, like the home page
    document.querySelectorAll<HTMLElement>(".s-phead > .wrap").forEach((w) => {
      if (w.querySelector(".ph-art")) return;
      const d = document.createElement("div"); d.className = "ph-art"; d.setAttribute("aria-hidden", "true"); d.innerHTML = HEADER_ART; w.prepend(d);
    });
  }, [path]);
  return null;
}
