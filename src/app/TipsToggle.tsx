"use client";
import { useEffect, useState } from "react";

/** 27 Nov (Alfonso): Settings → show or hide all tips (How it works guides, the (i) icons and tip lists), for everyone:
 *  staff, parents and students. Remembered in this browser (cookie ose_tips), read by the root layout so pages load right. */
export function TipsToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(document.documentElement.dataset.tips !== "off"); }, []);
  const set = (v: boolean) => {
    setOn(v);
    document.cookie = `ose_tips=${v ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
    if (v) delete document.documentElement.dataset.tips; else document.documentElement.dataset.tips = "off";
  };
  return <section className="card tips-set">
    <label className="tips-row"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span><b>Show tips</b><small>The <b>How it works</b> guides, the <b>(i)</b> icons and the tips on pages. Untick to hide them all; tick again to bring them back.</small></span></label>
  </section>;
}
