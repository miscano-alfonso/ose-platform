"use client";
import { useEffect, useRef, useState } from "react";
import { emailHtml, type EmailDesign } from "@/lib/email-layout";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => vars[k] ?? m);
/** A live preview of the email being written in the surrounding form, as it will look on a desktop or a phone.
 *  Reads the form's subject and body (and, on Email design, its logo, colour and footer) as you type. */
export function EmailPreview({ design, from, vars = {}, sample, marketing = false }: { design: EmailDesign; from: string; vars?: Record<string, string>; sample?: { subject: string; body: string }; marketing?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"desktop" | "phone">("desktop");
  const [v, setV] = useState({ subject: sample?.subject ?? "", body: sample?.body ?? "", d: design });
  const [w, setW] = useState(480);
  useEffect(() => {
    const form = box.current?.closest("form"); if (!form) return;
    const read = () => {
      const f = new FormData(form), s = (k: string) => (f.get(k) as string | null);
      setV({ subject: s("subject") ?? sample?.subject ?? "", body: s("body") ?? sample?.body ?? "",
        d: { ...design, ...(form.querySelector("[name=footer]") ? { footer: s("footer") ?? "", color: s("color") ?? design.color, logo: f.get("logo") === "on" } : {}) } });
    };
    read(); form.addEventListener("input", read); form.addEventListener("change", read);
    return () => { form.removeEventListener("input", read); form.removeEventListener("change", read); };
  }, [design, sample?.subject, sample?.body]);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect(); }, []);
  const doc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>${emailHtml(fill(v.body, vars), marketing, v.d)}</body></html>`;
  const DESK = 720, scale = Math.min(1, (w - 2) / DESK);
  return <div className="epv" ref={box}>
    <div className="epv-bar"><b>Preview</b><div className="segl" role="group" aria-label="Preview size">
      <button type="button" aria-current={mode === "desktop" ? "true" : undefined} onClick={() => setMode("desktop")}>Desktop</button>
      <button type="button" aria-current={mode === "phone" ? "true" : undefined} onClick={() => setMode("phone")}>Phone</button></div></div>
    <div className="epv-meta"><span><b>{from}</b></span><span className="epv-subj">{fill(v.subject, vars) || "(no subject)"}</span></div>
    {mode === "desktop"
      ? <div className="epv-desk" style={{ height: 620 * scale }}><iframe title="Email preview on a desktop" srcDoc={doc} style={{ width: DESK, height: 620, transform: `scale(${scale})` }} /></div>
      : <div className="epv-phone"><div className="epv-notch" /><iframe title="Email preview on a phone" srcDoc={doc} /></div>}
    <p className="muted" style={{ margin: 0, fontSize: 13 }}>Email programs differ a little; send yourself a test to check.</p>
  </div>;
}
