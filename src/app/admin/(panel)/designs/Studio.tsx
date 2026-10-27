"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioData, Asset } from "@/lib/designs";
import { TEMPLATES, SIZES, family, type SizeKey, type Vals, type Env, type Img } from "./templates";

type CanvaItem = { id: string; title: string; thumb: string | null; imported: boolean };
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function load(src: string): Promise<HTMLImageElement | null> {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
  return imgCache.get(src)!;
}
const assetUrl = (id: string) => `/admin/design-api?action=asset&id=${id}`;
const and = (xs: string[]) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

export default function Studio({ data, navy, canva }: { data: StudioData; navy: string; canva: boolean }) {
  const [tid, setTid] = useState(TEMPLATES[0].id);
  const [all, setAll] = useState<Record<string, Vals>>({});
  const [size, setSize] = useState<SizeKey>("square");
  const [assets, setAssets] = useState<Asset[]>(data.assets);
  const [ready, setReady] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tpl = TEMPLATES.find((t) => t.id === tid)!;
  const v: Vals = useMemo(() => {
    const d: Vals = {}; tpl.fields.forEach((f) => { if (f.def) d[f.k] = f.def; }); if (!("artMode" in d)) d.artMode = "line";
    if (tid === "tasterweek") d.ages = data.levels.filter((l) => l.min && l.max).map((l) => `${l.name.replace(/^iGCSE$/, "GCSE")} | Ages ${l.min}–${l.max}`).join("\n");
    return { ...d, ...(all[tid] ?? {}) };
  }, [tid, all, tpl, data.levels]);
  const set = (patch: Vals) => setAll((a) => ({ ...a, [tid]: { ...v, ...patch } }));

  // fonts: Jost (the site's font) and Yellowtail (the handwritten accent), from Google Fonts like the rest of the site
  useEffect(() => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&family=Yellowtail&display=block"; document.head.appendChild(l);
    const go = () => Promise.all(["300 40px Jost", "400 40px Jost", "500 40px Jost", "400 40px Yellowtail"].map((f) => document.fonts.load(f))).finally(() => setReady((n) => n + 1));
    l.onload = go; l.onerror = go;
    return () => { l.remove(); };
  }, []);

  // pictures this design needs
  const [imgs, setImgs] = useState<Record<string, Img | null>>({});
  useEffect(() => {
    const want: string[] = [];
    if (v.art) want.push(assetUrl(v.art));
    const t = data.teachers.find((x) => x.id === v.teacher); if (t?.photo) want.push(t.photo);
    (v.people ?? "").split(",").filter(Boolean).forEach((id) => { const p = data.teachers.find((x) => x.id === id)?.photo; if (p) want.push(p); });
    Promise.all(want.map(async (u) => [u, await load(u)] as const)).then((r) => setImgs(Object.fromEntries(r)));
  }, [v.art, v.teacher, v.people, data.teachers]);

  const env: Env = useMemo(() => ({
    subjects: data.subjects, navy,
    img: (k) => k ? imgs[assetUrl(k)] ?? null : null,
    photos: (k) => {
      if (k === "teacher") { const p = data.teachers.find((x) => x.id === v.teacher)?.photo; const i = p ? imgs[p] : null; return i ? [i] : []; }
      return (v.people ?? "").split(",").filter(Boolean).map((id) => data.teachers.find((x) => x.id === id)?.photo).map((p) => p ? imgs[p] : null).filter(Boolean) as Img[];
    },
  }), [imgs, data, navy, v.teacher, v.people]);

  const render = useCallback((canvas: HTMLCanvasElement, s: SizeKey) => {
    const Z = SIZES[s]; canvas.width = Z.w; canvas.height = Z.h; const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, Z.w, Z.h); tpl.draw(c, Z.w, Z.h, v, env);
  }, [tpl, v, env]);
  useEffect(() => { if (cv.current) render(cv.current, size); }, [render, size, ready]);

  // prefill from a course or a teacher
  const pickCourse = (id: string) => {
    const co = data.courses.find((x) => x.id === id); if (!co) return set({ course: "" });
    const lvl = co.level.replace(/^iGCSE$/, "iGCSE");
    set({ course: id, subject: co.subject, title: v.title || co.subject, top: `${lvl} ${co.subject} Classes\n${data.nextTerm ? `Starting ${data.nextTerm.name}!` : "Now booking!"}`, when: co.times.split(",")[0] ?? "" });
  };
  const pickTeacher = (id: string) => {
    const t = data.teachers.find((x) => x.id === id); if (!t) return set({ teacher: "" });
    const fam = t.subjects.length ? family(t.subjects[0]) : "";
    const lv = and(t.levels.map((l) => l.replace(/^iGCSE$/, "IGCSE")));
    set({ teacher: id, subject2: fam, intro: `I’m ${t.first}, ${fam} teacher at OH-SO ED.${lv ? ` I teach ${lv} *${fam}* courses!` : ""}` });
  };

  async function blob(type: string): Promise<Blob> {
    const c = document.createElement("canvas"); render(c, size);
    return new Promise((ok, no) => c.toBlob((b) => b ? ok(b) : no(new Error("Couldn’t make the picture.")), type, 0.92));
  }
  async function download() {
    const b = await blob("image/png"); const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = `OH-SO ED – ${tpl.name} (${SIZES[size].name}).png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function post() {
    setBusy("post"); setMsg("");
    try {
      const f = new FormData(); f.append("file", await blob("image/jpeg"), "design.jpg");
      const r = await fetch("/admin/social-api?action=upload", { method: "POST", body: f }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn’t save the picture.");
      location.href = `/admin/social?social=compose&img=${encodeURIComponent(j.path)}&text=${encodeURIComponent(tpl.caption(v))}`;
    } catch (e) { setMsg((e as Error).message); setBusy(""); }
  }
  async function upload(file: File, field: string) {
    setBusy("upload"); setMsg("");
    try {
      const f = new FormData(); f.append("file", file); f.append("kind", field === "art" ? "illustration" : "photo");
      const r = await fetch("/admin/design-api?action=upload", { method: "POST", body: f }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setAssets((a) => [{ id: j.id, name: file.name.replace(/\.[a-z0-9]+$/i, ""), kind: "illustration", source: "upload", created_at: new Date().toISOString() }, ...a]);
      set({ [field]: j.id }); setPicker(null);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  }

  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  const colours = [["", "Subject colour"], ["navy", "Navy"], ...data.subjects.map((s) => [s.colour, s.name])];
  return <div className="ds">
    <div className="ds-pick">{groups.map((g) => <div key={g}><div className="ds-g">{g}</div>
      {TEMPLATES.filter((t) => t.group === g).map((t) => <button key={t.id} type="button" className="ds-t" aria-pressed={t.id === tid} onClick={() => setTid(t.id)}>{t.name}</button>)}</div>)}</div>
    <div className="ds-main">
      <div className="ds-prev"><canvas ref={cv} style={{ aspectRatio: `${SIZES[size].w} / ${SIZES[size].h}` }} aria-label={`${tpl.name} preview`} />
        <div className="segl" role="group" aria-label="Size" style={{ marginTop: 10 }}>{(Object.keys(SIZES) as SizeKey[]).map((k) => <button key={k} type="button" aria-current={k === size ? "true" : undefined} onClick={() => setSize(k)}>{SIZES[k].name}</button>)}</div></div>
      <div className="ds-form card">
        <h2 style={{ marginTop: 0 }}>{tpl.name}</h2>
        {tpl.fields.map((f) => <label key={f.k} className="fld" style={{ display: "grid", gap: 4, marginBottom: 10 }}><span>{f.label}</span>
          {f.type === "text" && <input className="mini" value={v[f.k] ?? ""} placeholder={f.hint} onChange={(e) => set({ [f.k]: e.target.value })} />}
          {f.type === "area" && <textarea className="mini" rows={3} value={v[f.k] ?? ""} placeholder={f.hint} onChange={(e) => set({ [f.k]: e.target.value })} />}
          {f.type === "course" && <select className="mini" value={v.course ?? ""} onChange={(e) => pickCourse(e.target.value)}><option value="">Choose a course…</option>
            {data.courses.map((co) => <option key={co.id} value={co.id}>{co.level} {co.subject} ({co.code}){co.status === "waitlist" ? " · waiting list" : ""}</option>)}</select>}
          {f.type === "teacher" && <select className="mini" value={v.teacher ?? ""} onChange={(e) => pickTeacher(e.target.value)}><option value="">Choose…</option>
            {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.photo ? "" : " (no photo yet)"}</option>)}</select>}
          {f.type === "teachers" && <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{data.teachers.map((t) => { const on = (v.people ?? "").split(",").includes(t.id);
            return <span key={t.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={on} disabled={!t.photo} onChange={() => set({ people: ((v.people ?? "").split(",").filter((x) => x && x !== t.id).concat(on ? [] : [t.id])).join(",") })} />{t.first}</span>; })}</span>}
          {f.type === "colour" && <select className="mini" value={v.bg ?? ""} onChange={(e) => set({ bg: e.target.value })}>{colours.map(([val, l]) => <option key={l} value={val}>{l}</option>)}</select>}
          {f.type === "mode" && <select className="mini" value={v.artMode ?? "line"} onChange={(e) => set({ artMode: e.target.value })}><option value="line">Line drawing, tinted to match</option><option value="full">As it is (full colour)</option>{tid === "welcome" && <option value="duo">Photo, tinted blue</option>}</select>}
          {f.type === "image" && <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {v[f.k] ? <img src={assetUrl(v[f.k])} alt="" style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid var(--line)" }} /> : <span className="muted">None</span>}
            <button type="button" className="abtn sm" onClick={() => setPicker(f.k)}>Choose…</button>{v[f.k] && <button type="button" className="lnk" onClick={() => set({ [f.k]: "" })}>Remove</button>}</span>}
          {f.hint && f.type !== "text" && f.type !== "area" && <small className="muted">{f.hint}</small>}
        </label>)}
        <p className="note">Text and logos are made here; pictures and illustrations come from your library or Canva. Words in *stars* are highlighted.</p>
        <label className="fld" style={{ display: "grid", gap: 4 }}><span>Suggested caption</span><textarea className="mini" rows={3} readOnly value={tpl.caption(v)} /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="abtn pri" onClick={post} disabled={!!busy}>{busy === "post" ? "Saving…" : "Post to Facebook / Instagram"}</button>
          <button type="button" className="abtn" onClick={download}>Download PNG</button>
          <button type="button" className="abtn" onClick={() => navigator.clipboard?.writeText(tpl.caption(v)).then(() => setMsg("Caption copied."))}>Copy caption</button></div>
        {msg && <p className="note msg" style={{ marginTop: 10 }}>{msg}</p>}
      </div>
    </div>
    {picker && <Picker assets={assets} canva={canva} onClose={() => setPicker(null)} onPick={(id) => { set({ [picker]: id }); setPicker(null); }}
      onUpload={(f) => upload(f, picker)} onImported={(a) => { setAssets((x) => [a, ...x.filter((y) => y.id !== a.id)]); set({ [picker]: a.id }); setPicker(null); }} busy={busy === "upload"} />}
  </div>;
}

function Picker({ assets, canva, onClose, onPick, onUpload, onImported, busy }: { assets: Asset[]; canva: boolean; onClose: () => void; onPick: (id: string) => void; onUpload: (f: File) => void; onImported: (a: Asset) => void; busy: boolean }) {
  const [tab, setTab] = useState<"lib" | "canva">("lib");
  const [items, setItems] = useState<CanvaItem[] | null>(null);
  const [q, setQ] = useState(""); const [err, setErr] = useState(""); const [wait, setWait] = useState("");
  const list = useCallback(async (query: string) => {
    setErr(""); setItems(null);
    const r = await fetch(`/admin/design-api?action=canvalist&q=${encodeURIComponent(query)}`); const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn’t reach Canva."); setItems([]); } else setItems(j.items);
  }, []);
  useEffect(() => { if (tab === "canva" && canva && items === null) list(""); }, [tab, canva, items, list]);
  async function imp(it: CanvaItem) {
    setWait(it.id); setErr("");
    const r = await fetch("/admin/design-api?action=canvaimport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: it.id, title: it.title }) });
    const j = await r.json(); setWait("");
    if (!r.ok) return setErr(j.error || "Couldn’t bring that design in.");
    onImported({ id: j.id, name: it.title, kind: "illustration", source: "canva", created_at: new Date().toISOString() });
  }
  return <div className="ds-scrim" role="dialog" aria-modal="true" aria-label="Choose a picture" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ds-dlg card">
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}><h2 style={{ margin: 0 }}>Choose a picture</h2><span className="grow" style={{ flex: 1 }} /><button type="button" className="abtn sm" onClick={onClose}>Close</button></div>
      <div className="segl" role="tablist" style={{ marginBottom: 12 }}><button type="button" aria-current={tab === "lib" ? "true" : undefined} onClick={() => setTab("lib")}>Library</button><button type="button" aria-current={tab === "canva" ? "true" : undefined} onClick={() => setTab("canva")}>From Canva</button></div>
      {tab === "lib" ? <>
        <label className="abtn sm" style={{ marginBottom: 12, display: "inline-block" }}>{busy ? "Uploading…" : "Upload a picture"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} /></label>
        <div className="ds-grid">{assets.length === 0 ? <p className="muted">No pictures yet. Upload one, or bring one in from Canva.</p> : assets.map((a) => <button key={a.id} type="button" className="ds-tile" onClick={() => onPick(a.id)}>
          <img src={assetUrl(a.id)} alt="" loading="lazy" /><span>{a.name}{a.source === "canva" ? " · Canva" : ""}</span></button>)}</div></>
      : !canva ? <p className="note">Canva isn’t connected yet. Set it up under the Library &amp; Canva tab.</p> : <>
        <form onSubmit={(e) => { e.preventDefault(); list(q); }} style={{ display: "flex", gap: 6, marginBottom: 12 }}><input className="mini" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your Canva designs (or leave blank for your folder)" style={{ flex: 1 }} /><button className="abtn sm" type="submit">Search</button></form>
        {err && <p className="note msg bad">{err}</p>}
        {items === null ? <p className="muted">Loading your Canva designs…</p> : <div className="ds-grid">{items.length === 0 ? <p className="muted">Nothing found.</p> : items.map((it) => <button key={it.id} type="button" className="ds-tile" disabled={!!wait} onClick={() => imp(it)}>
          {it.thumb ? <img src={it.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="muted" style={{ height: 120, display: "grid", placeItems: "center" }}>No preview</span>}
          <span>{wait === it.id ? "Bringing it in…" : it.title}{it.imported ? " · in library" : ""}</span></button>)}</div>}
        <p className="note">The first page of the design is exported as a PNG and kept in your library. Put each illustration on its own Canva design (a white or transparent background works best for line drawings).</p></>}
    </div></div>;
}
