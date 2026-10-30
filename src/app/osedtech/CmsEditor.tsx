"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cmsSaveText, cmsSaveSection, cmsMoveSection, cmsSaveStyle, cmsPublish, cmsDiscard, cmsExit } from "./cms-actions";
import { SIZES, BACKGROUNDS, FONTS, type SecSet, type StyleSet } from "@/lib/edt-cms-key";

// The OH-SO EdTech website editor in the browser: click any text to type over it, hover a section for its spacing,
// background, order and visibility, and set the site's styles. Everything saves as a draft until Publish.
type Props = { hasDraft: boolean; publishedAt: string | null; sec: Record<string, SecSet>; style: StyleSet; by: string };

export function CmsEditor({ hasDraft, publishedAt, sec, style, by }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "browse">("edit");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [hover, setHover] = useState<{ id: string; top: number; left: number } | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [styles, setStyles] = useState(false);
  const modeRef = useRef(mode); modeRef.current = mode;
  const draftRef = useRef(hasDraft); draftRef.current = hasDraft;   // the first change makes a draft: refresh once so Publish lights up
  const say = (m: string) => { setMsg(m); window.setTimeout(() => setMsg((x) => (x === m ? null : x)), 2500); };

  // make every piece of text editable (also after the page changes or refreshes)
  useEffect(() => {
    const prep = () => document.querySelectorAll<HTMLElement>("[data-edt]").forEach((el) => {
      const on = modeRef.current === "edit";
      if (on) { el.setAttribute("contenteditable", "plaintext-only"); el.spellcheck = true; } else el.removeAttribute("contenteditable");
      if (!el.dataset.saved) el.dataset.saved = el.innerText;
    });
    prep();
    const mo = new MutationObserver(prep); mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [mode]);

  useEffect(() => {
    const click = (e: MouseEvent) => { if (modeRef.current === "edit" && (e.target as HTMLElement).closest?.("[data-edt]")) { e.preventDefault(); } };
    const key = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t.dataset?.edt && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); t.blur(); } if (t.dataset?.edt && e.key === "Escape") { t.innerText = t.dataset.saved ?? ""; t.blur(); } };
    const out = (e: FocusEvent) => {
      const t = e.target as HTMLElement; if (!t.dataset?.edt) return;
      const v = t.innerText.replace(/\s+/g, " ").trim();
      if (v === (t.dataset.saved ?? "").replace(/\s+/g, " ").trim()) return;
      if (!v) t.innerText = t.dataset.orig ?? "";
      t.dataset.saved = v || (t.dataset.orig ?? "");
      start(async () => { await cmsSaveText(t.dataset.edt!, v, t.dataset.orig ?? ""); if (!draftRef.current) router.refresh(); say(v ? "Saved to the draft" : "Original wording put back"); });
    };
    const over = (e: MouseEvent) => {
      const s = (e.target as HTMLElement).closest?.<HTMLElement>("[data-edt-sec]"); if (!s) return;
      const r = s.getBoundingClientRect();
      setHover((h) => h && h.id === s.dataset.edtSec && Math.abs(h.top - (r.top + scrollY)) < 2 ? h : { id: s.dataset.edtSec!, top: r.top + scrollY, left: r.left + scrollX });
    };
    document.addEventListener("click", click, true); document.addEventListener("keydown", key, true);
    document.addEventListener("focusout", out, true); document.addEventListener("mouseover", over);
    return () => { document.removeEventListener("click", click, true); document.removeEventListener("keydown", key, true); document.removeEventListener("focusout", out, true); document.removeEventListener("mouseover", over); };
  }, [router]);

  const run = (fn: () => Promise<void>, done: string) => start(async () => { await fn(); router.refresh(); say(done); });
  const count = (page: string) => document.querySelectorAll(`[data-edt-sec^="${page}:"]`).length;
  const hid = hover ? sec[hover.id]?.hidden : false;
  const page = hover?.id.split(":")[0] ?? "", idx = hover ? Number(hover.id.split(":")[1]) : 0;

  return <>
    <style>{CSS}</style>
    {mode === "edit" && hover && <div className="cms-sbar" style={{ top: hover.top + 8, left: Math.max(8, hover.left + 8) }}>
      <b>Section {idx + 1}</b>
      <button type="button" title="Move up" disabled={busy} onClick={() => run(() => cmsMoveSection(page, idx, -1, count(page)), "Moved up")}>↑</button>
      <button type="button" title="Move down" disabled={busy} onClick={() => run(() => cmsMoveSection(page, idx, 1, count(page)), "Moved down")}>↓</button>
      <button type="button" onClick={() => setPanel(hover.id)}>Spacing</button>
      <button type="button" disabled={busy} onClick={() => run(() => cmsSaveSection(hover.id, { ...(sec[hover.id] ?? {}), hidden: !hid }), hid ? "Section shown" : "Section hidden")}>{hid ? "Show" : "Hide"}</button>
    </div>}
    {panel && <SectionPanel id={panel} s={sec[panel] ?? {}} close={() => setPanel(null)} save={(v) => run(() => cmsSaveSection(panel, v), "Section saved")} />}
    {styles && <StylePanel s={style} close={() => setStyles(false)} save={(v) => run(() => cmsSaveStyle(v), "Styles saved")} />}
    <div className="cms-bar" role="region" aria-label="Website editor">
      <span className="cms-t"><b>Editing OH-SO EdTech</b><small>{msg ?? (busy ? "Saving…" : hasDraft ? `Draft not published yet · by ${by}` : publishedAt ? `Published ${new Date(publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Click any text to change it")}</small></span>
      <span className="cms-seg" role="group" aria-label="Mode"><button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Edit</button><button type="button" aria-pressed={mode === "browse"} onClick={() => { setMode("browse"); setHover(null); }}>Browse</button></span>
      <button type="button" onClick={() => setStyles(true)}>Site styles</button>
      {hasDraft && <button type="button" disabled={busy} onClick={() => { if (confirm("Throw away the draft and go back to the published site?")) run(cmsDiscard, "Draft discarded"); }}>Discard draft</button>}
      <button type="button" className="pri" disabled={busy || !hasDraft} onClick={() => run(cmsPublish, "Published: everyone sees it now")}>Publish</button>
      <button type="button" disabled={busy} onClick={() => start(async () => { await cmsExit(); location.reload(); })}>Exit</button>
    </div>
  </>;
}

function SectionPanel({ id, s, close, save }: { id: string; s: SecSet; close: () => void; save: (v: SecSet | null) => void }) {
  const [v, setV] = useState<SecSet>(s);
  const custom = !!v.bg && v.bg.startsWith("#");
  return <div className="cms-panel" role="dialog" aria-label="Section settings">
    <header><b>Section {Number(id.split(":")[1]) + 1}</b><button type="button" onClick={close} aria-label="Close">×</button></header>
    <label>Space above<select value={v.pt ?? ""} onChange={(e) => setV({ ...v, pt: (e.target.value || undefined) as SecSet["pt"] })}><option value="">As designed</option>{SIZES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    <label>Space below<select value={v.pb ?? ""} onChange={(e) => setV({ ...v, pb: (e.target.value || undefined) as SecSet["pb"] })}><option value="">As designed</option>{SIZES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    <label>Background<select value={custom ? "custom" : v.bg ?? ""} onChange={(e) => setV({ ...v, bg: e.target.value === "custom" ? "#f5c84b" : e.target.value || undefined })}><option value="">As designed</option>
      {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}<option value="custom">A colour…</option></select></label>
    {custom && <label>Colour<input type="color" value={v.bg} onChange={(e) => setV({ ...v, bg: e.target.value })} /></label>}
    <footer><button type="button" onClick={() => { save(v); close(); }} className="pri">Save</button><button type="button" onClick={() => { save(null); close(); }}>Reset section</button></footer>
  </div>;
}

function StylePanel({ s, close, save }: { s: StyleSet; close: () => void; save: (v: StyleSet | null) => void }) {
  const [v, setV] = useState<StyleSet>(s);
  const col = (k: "accent" | "title" | "eyebrow", label: string, d: string) => <label>{label}<span className="cms-row"><input type="color" value={v[k] ?? d} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    {v[k] && <button type="button" onClick={() => setV({ ...v, [k]: undefined })}>Default</button>}</span></label>;
  return <div className="cms-panel wide" role="dialog" aria-label="Site styles">
    <header><b>Site styles</b><button type="button" onClick={close} aria-label="Close">×</button></header>
    {col("accent", "Accent colour (buttons and links)", "#0cc0df")}
    {col("title", "Page titles", "#45d3ec")}
    {col("eyebrow", "Eyebrows (small capitals above titles)", "#f1f2f4")}
    <label>Font<select value={v.font ?? "Jost"} onChange={(e) => setV({ ...v, font: e.target.value === "Jost" ? undefined : e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
    <label>Text size<select value={v.size ?? 17} onChange={(e) => setV({ ...v, size: Number(e.target.value) === 17 ? undefined : Number(e.target.value) })}>{[15, 16, 17, 18, 19, 20].map((n) => <option key={n} value={n}>{n}px{n === 17 ? " (as designed)" : ""}</option>)}</select></label>
    <label>Space between sections<select value={v.space ?? "normal"} onChange={(e) => setV({ ...v, space: e.target.value === "normal" ? undefined : e.target.value as StyleSet["space"] })}><option value="compact">Compact</option><option value="normal">As designed</option><option value="roomy">Roomy</option></select></label>
    <label>Buttons<select value={v.btn ?? "pill"} onChange={(e) => setV({ ...v, btn: e.target.value === "pill" ? undefined : e.target.value as StyleSet["btn"] })}><option value="pill">Pill (as designed)</option><option value="round">Rounded</option><option value="square">Square</option></select></label>
    <label>Card corners: {v.card ?? 16}px<input type="range" min={0} max={32} value={v.card ?? 16} onChange={(e) => setV({ ...v, card: Number(e.target.value) === 16 ? undefined : Number(e.target.value) })} /></label>
    <footer><button type="button" className="pri" onClick={() => { save(v); close(); }}>Save</button><button type="button" onClick={() => { save(null); close(); }}>Back to the design</button></footer>
  </div>;
}

const CSS = `
.edt [data-edt][contenteditable]{outline:1px dashed transparent;outline-offset:3px;border-radius:3px;cursor:text}
.edt [data-edt][contenteditable]:hover{outline-color:#5fe0e8}
.edt [data-edt][contenteditable]:focus{outline:2px solid #5fe0e8;background:rgba(95,224,232,.12)}
.edt [data-edt-sec]{position:relative}
.edt [data-edt-sec]:hover{box-shadow:inset 0 0 0 2px rgba(95,224,232,.45)}
.edt [data-edt-hidden="1"] > *{opacity:.35}
.edt [data-edt-hidden="1"]::before{content:"Hidden on the live site";position:absolute;top:12px;right:12px;background:#f5c84b;color:#12162f;font:600 13px/1 Jost,sans-serif;padding:6px 10px;border-radius:999px;z-index:5}
.cms-bar{position:fixed;left:12px;right:12px;margin-inline:auto;width:fit-content;bottom:16px;z-index:1000;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;
  background:#12162f;color:#fff;border:1px solid #3a3f66;border-radius:18px;padding:10px 12px;box-shadow:0 18px 40px -12px rgba(0,0,0,.6);font:15px/1.3 Jost,system-ui,sans-serif}
.cms-bar .cms-t{display:grid;margin-right:6px}.cms-bar small{color:#c5c9de;font-size:13px}
.cms-bar button,.cms-sbar button,.cms-panel button{font:inherit;font-weight:500;border-radius:999px;border:1px solid #4a507a;background:transparent;color:inherit;padding:7px 14px;cursor:pointer}
.cms-bar button:hover:not(:disabled),.cms-sbar button:hover:not(:disabled),.cms-panel button:hover{background:#5fe0e8;border-color:#5fe0e8;color:#0f1747}
.cms-bar button.pri,.cms-panel button.pri{background:#5fe0e8;border-color:#5fe0e8;color:#0f1747}
.cms-bar button:disabled{opacity:.45;cursor:default}
.cms-seg{display:inline-flex;border:1px solid #4a507a;border-radius:999px;padding:2px}.cms-seg button{border:0;padding:5px 12px}.cms-seg button[aria-pressed=true]{background:#f1f2f4;color:#12162f}
.cms-sbar{position:absolute;z-index:999;display:flex;gap:6px;align-items:center;background:#12162f;color:#fff;border-radius:999px;padding:6px 8px 6px 14px;font:14px/1 Jost,system-ui,sans-serif;box-shadow:0 8px 20px -8px rgba(0,0,0,.6)}
.cms-sbar button{padding:5px 10px}
.cms-panel{position:fixed;right:16px;top:84px;z-index:1001;width:min(340px,calc(100vw - 32px));max-height:calc(100vh - 180px);overflow:auto;background:#fff;color:#12162f;border-radius:16px;padding:16px;display:grid;gap:12px;box-shadow:0 24px 50px -16px rgba(0,0,0,.55);font:15px/1.4 Jost,system-ui,sans-serif}
.cms-panel header,.cms-panel footer{display:flex;justify-content:space-between;align-items:center;gap:8px}
.cms-panel footer{justify-content:flex-start}
.cms-panel label{display:grid;gap:4px;font-weight:500}
.cms-panel select,.cms-panel input[type=range]{font:inherit;padding:8px;border:1px solid #cfd2dc;border-radius:10px;background:#fff;color:#12162f}
.cms-panel input[type=color]{width:52px;height:34px;border:1px solid #cfd2dc;border-radius:8px;padding:2px;background:#fff}
.cms-panel button{border-color:#cfd2dc;color:#12162f}
.cms-row{display:flex;gap:8px;align-items:center}
`;
