"use client";
import { useEffect } from "react";

/** 27 Nov (Alfonso): on the report-writing page, each report's Save draft button reads "Saved" until something in that
 *  report changes (typing, a score, or a Draft with AI), then "Save draft" again. Saving one report also keeps every
 *  other report with unsaved changes (as drafts), so nothing written below is lost when the page reloads; and leaving
 *  the page with unsaved changes asks first. */
export function WriteDirty() {
  useEffect(() => {
    const form = document.getElementById("wr-form") as HTMLFormElement | null; if (!form) return;
    const cards = [...form.querySelectorAll<HTMLElement>("section.wr-card")].map((el) => ({ id: el.id.replace(/^r-/, ""), el }));
    const fields = (id: string) => [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name$="_${id}"]`)];
    const snap = (id: string) => fields(id).map((x) => `${x.name}=${x.value}`).join("\u0001");
    const start = new Map(cards.map((c) => [c.id, snap(c.id)]));
    const hadText = new Map(cards.map((c) => [c.id, !!(form.querySelector<HTMLTextAreaElement>(`textarea[name="comment_${c.id}"]`)?.value.trim())]));
    let sending = false;
    const dirtyIds = () => cards.filter((c) => snap(c.id) !== start.get(c.id)).map((c) => c.id);
    const paint = () => {
      const dirty = new Set(dirtyIds());
      for (const c of cards) {
        const b = form.querySelector<HTMLButtonElement>(`button[name="one"][value="${c.id}:0"]`); if (!b) continue;
        const d = dirty.has(c.id);
        b.textContent = d || !hadText.get(c.id) ? "Save draft" : "Saved ✓";
        b.disabled = !d; b.classList.toggle("wr-saved", !d && !!hadText.get(c.id));
        c.el.classList.toggle("wr-dirty", d);
      }
    };
    paint();
    const t = setInterval(paint, 700);   // also picks up text put in by Draft with AI
    form.addEventListener("input", paint); form.addEventListener("change", paint);
    const onSubmit = () => {
      sending = true;
      form.querySelector('input[name="dirty"]')?.remove();
      const h = document.createElement("input"); h.type = "hidden"; h.name = "dirty"; h.value = dirtyIds().join(","); form.appendChild(h);
    };
    form.addEventListener("submit", onSubmit, true);
    const leave = (e: BeforeUnloadEvent) => { if (!sending && dirtyIds().length) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    return () => { clearInterval(t); form.removeEventListener("input", paint); form.removeEventListener("change", paint); form.removeEventListener("submit", onSubmit, true); window.removeEventListener("beforeunload", leave); };
  }, []);
  return null;
}
