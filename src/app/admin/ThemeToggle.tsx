"use client";
import { useState } from "react";

// Light, dark, or follow the computer's setting. Remembered on this device (a cookie, so the page opens in the right colours).
const OPTS = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]] as const;
export function ThemeToggle({ initial }: { initial: string }) {
  const [t, setT] = useState(initial === "light" || initial === "dark" ? initial : "auto");
  const pick = (v: string) => {
    setT(v);
    [document.documentElement, ...document.querySelectorAll<HTMLElement>(".adm")].forEach((el) => { if (v === "auto") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", v); });
    document.cookie = `ose_theme=${v}; path=/; max-age=${v === "auto" ? 0 : 31536000}; samesite=lax`;
  };
  return <div className="theme-seg" role="group" aria-label="Colours">{OPTS.map(([v, l]) =>
    <button key={v} type="button" aria-pressed={t === v} onClick={() => pick(v)}>{l}</button>)}</div>;
}
