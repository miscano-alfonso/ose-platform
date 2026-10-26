"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STYLE_GROUPS, STYLE_TOKENS, FONTS, WEIGHTS, FONT_SCOPES, stylesCss, fontsHref, type Device, type SiteStyles, type FontChoice } from "@/lib/styles";
import { saveStylesAction } from "../../actions";

const PAGES: [string, string][] = [["Homepage", "/"], ["Courses", "/courses"], ["Other services", "/other-services"], ["Term dates", "/term-dates"],
  ["Teachers", "/teachers"], ["Prices", "/pricing"], ["Calculator", "/calculator"], ["Timetable", "/timetable"], ["FAQs", "/faq"], ["Contact", "/contact"]];
const WIDTH: Record<Device, number> = { desktop: 1440, phone: 390 };
const PROBES = STYLE_TOKENS.map(({ id, sel, prop }) => ({ id, sel, prop }));

export function StyleBuilder({ saved }: { saved: SiteStyles }) {
  const [styles, setStyles] = useState<SiteStyles>(saved);
  const [device, setDevice] = useState<Device>("desktop");
  const [page, setPage] = useState("/");
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const [box, setBox] = useState({ w: 800, h: 700 });
  const frame = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const css = useMemo(() => stylesCss(styles), [styles]);
  const dirty = JSON.stringify(styles) !== JSON.stringify(saved);

  const fonts = useMemo(() => fontsHref(styles), [styles]);
  const send = useCallback(() => frame.current?.contentWindow?.postMessage({ type: "ose-styles", css, fonts, probes: PROBES }, location.origin), [css, fonts]);
  useEffect(() => { send(); }, [send, device]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "ose-ready") send();
      if (e.data?.type === "ose-sizes") setSizes(e.data.sizes ?? {});
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [send]);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (id: string, v: number | null) => setStyles((s) => {
    const d = { ...s[device] }; if (v == null) delete d[id]; else d[id] = v;
    return { ...s, [device]: d };
  });
  const setFont = (id: string, patch: FontChoice) => setStyles((s) => {
    const all = { ...(s.fonts ?? {}) }; const next = { ...all[id], ...patch };
    if (!next.family) delete next.family; if (!next.weight) delete next.weight;
    if (next.family || next.weight) all[id] = next; else delete all[id];
    return { ...s, fonts: all };
  });
  const fontCount = Object.keys(styles.fonts ?? {}).length;
  const FontPick = ({ id, def }: { id: string; def: string }) => { // called as a function so the selects keep focus
    const f = styles.fonts?.[id] ?? {};
    return <div className={`sb-font${f.family || f.weight ? " set" : ""}`}>
      <select aria-label="Font" value={f.family ?? ""} onChange={(e) => setFont(id, { family: e.target.value || undefined })}>
        <option value="">{def}</option>{FONTS.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}</select>
      <select aria-label="Weight" value={f.weight ?? ""} onChange={(e) => setFont(id, { weight: Number(e.target.value) || undefined })}>
        <option value="">Default weight</option>{WEIGHTS.map(([n, l]) => <option key={n} value={n}>{l} ({n})</option>)}</select>
    </div>;
  };
  const w = WIDTH[device];
  const scale = Math.min(1, box.w / w);
  const changed = Object.keys(styles[device]).length;

  return <div className="sb">
    <div className="sb-side">
      <div className="sb-bar">
        <div className="seg" role="group" aria-label="Device">
          {(["desktop", "phone"] as Device[]).map((d) => <button key={d} type="button" className={device === d ? "on" : ""} aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "desktop" ? "Desktop" : "Phone"}</button>)}
        </div>
        <label className="fld sb-page">Preview page<select value={page} onChange={(e) => setPage(e.target.value)}>{PAGES.map(([l, h]) => <option key={h} value={h}>{l}</option>)}</select></label>
      </div>
      <p className="muted sb-note">{device === "desktop" ? "Desktop sizes apply to screens wider than 820px." : "Phone sizes apply to screens 820px wide or less."} {changed ? `${changed} changed for ${device}.` : "Nothing changed yet; everything uses the default."}</p>
      <details className="sb-grp" open>
        <summary>Fonts</summary>
        <p className="muted sb-note">Fonts and weights apply on every screen size. Each text item below can also have its own.</p>
        {FONT_SCOPES.map((sc) => <div key={sc.id} className="sb-row sb-frow">
          <div className="sb-lab"><label>{sc.label}</label><small>{sc.hint}</small></div>
          {FontPick({ id: sc.id, def: sc.id === "site" ? "Jost (current)" : "Same as website font" })}
        </div>)}
        {fontCount > 0 && <button type="button" className="abtn sm" style={{ justifySelf: "start", marginTop: 6 }} onClick={() => setStyles((s) => ({ ...s, fonts: {} }))}>Reset all fonts</button>}
      </details>
      {STYLE_GROUPS.map((g) => <details key={g} className="sb-grp" open={g === "Headings"}>
        <summary>{g}</summary>
        {STYLE_TOKENS.filter((t) => t.group === g).map((t) => {
          const v = styles[device][t.id]; const seen = sizes[t.id]; const shown = v ?? seen ?? Math.round((t.min + t.max) / 2);
          const off = v == null && seen == null;
          return <div key={t.id} className={`sb-row${v != null ? " set" : ""}`}>
            <div className="sb-lab"><label htmlFor={`sb-${t.id}`}>{t.label}</label>{t.hint && <small>{t.hint}</small>}{off && <small>Not on this preview page</small>}</div>
            <input id={`sb-${t.id}`} type="range" min={t.min} max={t.max} step={t.step} value={shown} onChange={(e) => set(t.id, Number(e.target.value))} />
            <span className="sb-val">{off ? "–" : t.unit ? `${shown}px` : shown}</span>
            {v != null ? <button type="button" className="abtn sm" onClick={() => set(t.id, null)} title="Back to the default">Reset</button> : <span className="sb-def">Default</span>}
            {t.prop === "font-size" && FontPick({ id: t.id, def: /^(hero_h1|page_h1|sec_h2|card_h3)$/.test(t.id) ? "Same as headings font" : "Same as website font" })}
          </div>;
        })}
      </details>)}
      <form action={saveStylesAction} className="sb-save">
        <input type="hidden" name="styles" value={JSON.stringify(styles)} />
        <button className="abtn pri" type="submit" disabled={!dirty}>{dirty ? "Save and publish" : "Saved"}</button>
        <button className="abtn" type="button" disabled={!dirty} onClick={() => setStyles(saved)}>Undo changes</button>
        <button className="abtn" type="button" onClick={() => setStyles((s) => ({ ...s, [device]: {} }))} disabled={!changed}>Reset all {device}</button>
      </form>
    </div>
    <div className="sb-view" ref={wrap}>
      <div className="sb-frame" style={{ width: w * scale, height: box.h - 30 }}>
        <iframe ref={frame} title="Website preview" src={page} onLoad={send}
          style={{ width: w, height: (box.h - 30) / scale, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
      </div>
      <p className="muted sb-cap">{device === "desktop" ? `Desktop, ${w}px wide${scale < 1 ? ` (shown at ${Math.round(scale * 100)}%)` : ""}` : `Phone, ${w}px wide`}. Links inside the preview work, so you can click through the site.</p>
    </div>
  </div>;
}
