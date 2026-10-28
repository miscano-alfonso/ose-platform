"use client";
import { useEffect, useState } from "react";

// The website's light/dark switch. Follows the device until the visitor picks one; the choice is remembered
// in the same cookie the dashboards use (ose_theme), so the account and admin open in the same colours.
const SUN = "M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5 3.6 3.6M20.4 20.4 19 19M5 19l-1.4 1.4M20.4 3.6 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
const MOON = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z";
export function SiteTheme() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const set = document.documentElement.getAttribute("data-theme");
    setDark(set ? set === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const flip = () => {
    const v = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", v);
    document.cookie = `ose_theme=${v}; path=/; max-age=31536000; samesite=lax`;
    setDark(!dark);
  };
  return <button type="button" className="s-theme" onClick={flip} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={dark ? SUN : MOON} /></svg>
    <span>{dark ? "Light" : "Dark"}</span></button>;
}
