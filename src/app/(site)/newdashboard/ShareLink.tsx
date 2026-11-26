"use client";
import { useState } from "react";

// 26 Nov: Copy link and Share for one introduction page (/newdashboard). Share uses the phone's or computer's own share
// sheet where there is one; otherwise it offers email and WhatsApp.
export function ShareLink({ url, title, text }: { url: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false), [open, setOpen] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch { const t = document.createElement("textarea"); t.value = url; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
    setOpen((o) => !o);
  };
  const msg = `${text} ${url}`;
  return <div className="ndl-acts">
    <button type="button" className="ndl-btn" onClick={copy} aria-live="polite">{copied ? "Copied ✓" : "Copy link"}</button>
    <button type="button" className="ndl-btn" onClick={share} aria-expanded={open}>Share</button>
    {open && <div className="ndl-share">
      <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(msg)}`}>Email</a>
      <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
    </div>}
  </div>;
}
