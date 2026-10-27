// Social post designs in the OH-SO ED style (from the Facebook page): navy or subject-colour squares, thin capitals (Jost),
// a pink script accent, the subject roundels, duotone teacher photos and tinted line illustrations. Drawn on a canvas.

export const NAVY = "#141a5c", PINK = "#e8338c", YELLOW = "#f2df4c", SKY = "#63b3ea", WHITE = "#ffffff", GOLD = "#e9c46a";
export let SANS = "Jost", SCRIPT = "Yellowtail";
/** The page loads the fonts with next/font, which gives them their own family names. */
export function setFonts(sans: string, scr: string) { SANS = sans; SCRIPT = scr; }

export type Img = HTMLImageElement | HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;
export type Field = { k: string; label: string; type: "text" | "area" | "course" | "teacher" | "teachers" | "image" | "colour" | "mode"; hint?: string; def?: string };
export type Vals = Record<string, string>;
export type Env = { subjects: { name: string; colour: string }[]; img: (k: string) => Img | null; photos: (k: string) => Img[]; navy: string };
export type Tpl = { id: string; group: string; name: string; fields: Field[]; caption: (v: Vals) => string; draw: (c: Ctx, W: number, H: number, v: Vals, e: Env) => void };

// ---------- colour ----------
const hex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); const n = m ? parseInt(m[1], 16) : 0x8494c2; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (r: number[]) => "#" + r.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const shade = (c: string, t: number) => mix(c, "#000000", t), tint = (c: string, t: number) => mix(c, "#ffffff", t);
const lum = (c: string) => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

// ---------- subject families (the roundels: OH–SO ENGLISH, OH–SO SCIENCE …) ----------
export function family(subject: string): string {
  const s = subject.toLowerCase();
  if (/literature|english|language/.test(s)) return "English";
  if (/biology|chemistry|physics|science/.test(s)) return "Science";
  if (/math/.test(s)) return "Maths";
  return subject.split(/\s+/)[0] || subject;
}
export function familyColour(f: string, e: Env): string {
  const hit = e.subjects.find((s) => family(s.name) === f && s.name.toLowerCase() === f.toLowerCase()) ?? e.subjects.find((s) => family(s.name) === f);
  return hit?.colour ?? "#8494c2";
}
export const families = (e: Env) => [...new Set(e.subjects.map((s) => family(s.name)))].slice(0, 8);

// ---------- text ----------
type TOpt = { x: number; y: number; w: number; size: number; weight?: number; font?: string; colour?: string; align?: CanvasTextAlign; lh?: number; upper?: boolean; lines?: number; ls?: number; min?: number };
const fnt = (o: TOpt, size: number) => `${o.weight ?? 400} ${size}px "${o.font ?? SANS}", Arial, sans-serif`;
function wrap(c: Ctx, text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) { const t = cur ? cur + " " + word : word; if (c.measureText(t).width > w && cur) { out.push(cur); cur = word; } else cur = t; }
    out.push(cur);
  }
  return out;
}
/** Wraps and shrinks text to fit `lines` lines in width w. Returns the y below the last line. Words in *stars* are drawn in `hi`. */
export function text(c: Ctx, s: string, o: TOpt, hi?: string): number {
  if (!s) return o.y;
  let str = o.upper ? s.toUpperCase() : s, size = o.size, lines: string[] = [];
  const max = o.lines ?? 3, min = o.min ?? o.size * 0.45;
  for (;;) {
    c.font = fnt(o, size); if ("letterSpacing" in c) (c as Ctx & { letterSpacing: string }).letterSpacing = `${(o.ls ?? 0) * size}px`;
    lines = wrap(c, str.replace(/\*/g, ""), o.w);
    if ((lines.length <= max && lines.every((l) => c.measureText(l).width <= o.w)) || size <= min) break;
    size *= 0.94;
  }
  str = o.upper ? s.toUpperCase() : s;
  const lh = (o.lh ?? 1.08) * size; let y = o.y + size * 0.85;
  c.textAlign = o.align ?? "left"; c.textBaseline = "alphabetic";
  // highlighted words: walk the source words in order
  const words = str.split(/\s+/).filter(Boolean); let wi = 0;
  for (const line of lines) {
    if (!hi || !str.includes("*")) { c.fillStyle = o.colour ?? WHITE; c.fillText(line, o.x, y); y += lh; continue; }
    const parts = line.split(" "); const full = c.measureText(line).width;
    let x = o.align === "center" ? o.x - full / 2 : o.align === "right" ? o.x - full : o.x; c.textAlign = "left";
    for (const p of parts) { const src = words[wi++] ?? p; const on = /\*/.test(src); c.fillStyle = on ? hi : o.colour ?? WHITE; c.fillText(p, x, y); x += c.measureText(p + " ").width; }
    c.textAlign = o.align ?? "left"; y += lh;
  }
  if ("letterSpacing" in c) (c as Ctx & { letterSpacing: string }).letterSpacing = "0px";
  return y - lh + size * 0.3;
}
/** The pink handwritten accent ("Taster Week!", "Enrol now"), slightly tilted. */
export function script(c: Ctx, s: string, x: number, y: number, size: number, colour: string, w: number, angle = -8, align: CanvasTextAlign = "left") {
  if (!s) return;
  c.save(); c.translate(x, y); c.rotate(angle * Math.PI / 180);
  let z = size; c.font = `400 ${z}px "${SCRIPT}", cursive`;
  while (c.measureText(s).width > w && z > size * 0.4) { z *= 0.95; c.font = `400 ${z}px "${SCRIPT}", cursive`; }
  c.fillStyle = colour; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, 0, 0); c.restore();
}
/** "OH–SO ED", or a subject sub-brand "OH–SO / ENGLISH" on two lines. */
export function brand(c: Ctx, x: number, y: number, size: number, colour: string, align: CanvasTextAlign = "left", sub?: string) {
  c.fillStyle = colour; c.textAlign = align; c.textBaseline = "alphabetic";
  c.font = `400 ${size}px "${SANS}", Arial, sans-serif`;
  if ("letterSpacing" in c) (c as Ctx & { letterSpacing: string }).letterSpacing = `${size * 0.04}px`;
  if (sub) { c.fillText("OH–SO", x, y - size * 0.95); c.fillText(sub.toUpperCase(), x, y); }
  else c.fillText("OH–SO ED", x, y);
  if ("letterSpacing" in c) (c as Ctx & { letterSpacing: string }).letterSpacing = "0px";
}
export function roundel(c: Ctx, cx: number, cy: number, r: number, fam: string, colour: string) {
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = colour; c.fill();
  c.fillStyle = WHITE; c.textAlign = "center"; c.textBaseline = "middle";
  const label = fam.toUpperCase(); let z = r * 0.36; c.font = `400 ${z}px "${SANS}", Arial, sans-serif`;
  while (c.measureText(label).width > r * 1.6 && z > 6) { z *= 0.92; c.font = `400 ${z}px "${SANS}", Arial, sans-serif`; }
  c.fillText("OH–SO", cx, cy - z * 0.6); c.fillText(label, cx, cy + z * 0.6);
}
/** A row of roundels along the top or bottom edge, as on the taster and offer posts. */
export function roundelRow(c: Ctx, W: number, y: number, e: Env) {
  const fs = families(e); if (!fs.length) return; const r = W / (fs.length * 2 + 0.4) * 1.02;
  fs.forEach((f, i) => roundel(c, r * 1.1 + i * r * 2.02, y, r, f, familyColour(f, e)));
}
/** Roundels on an arc down the right-hand edge (the "There’s still time" and taster posts). */
export function roundelCluster(c: Ctx, W: number, cy: number, span: number, e: Env) {
  const fs = families(e); const n = fs.length; if (!n) return;
  const r = Math.min(W * 0.085, span / (n * 1.15)), R = W * 0.5, cx = W * 1.26;
  fs.forEach((f, i) => { const t = n === 1 ? 0 : i / (n - 1) - 0.5; const a = Math.PI + t * (span / R);
    roundel(c, cx + Math.cos(a) * R + (i % 2 ? -r * 1.15 : 0), cy + Math.sin(a) * R, r, f, familyColour(f, e)); });
}

// ---------- pictures ----------
const work = () => document.createElement("canvas");
/** Duotone: the photo's light and dark mapped onto two shades of a colour (the teacher photos on the page). */
export function duotone(img: Img, colour: string): HTMLCanvasElement {
  const cv = work(), w = (img as HTMLImageElement).naturalWidth || img.width, h = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.min(1, 1200 / Math.max(w, h)); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
  const x = cv.getContext("2d")!; x.drawImage(img, 0, 0, cv.width, cv.height);
  const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data;
  const dark = hex(shade(colour, lum(colour) > 0.6 ? 0.75 : 0.62)), light = hex(tint(colour, 0.78));
  for (let i = 0; i < p.length; i += 4) { const l = Math.pow((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255, 0.9); for (let k = 0; k < 3; k++) p[i + k] = dark[k] + (light[k] - dark[k]) * l; }
  x.putImageData(d, 0, 0); return cv;
}
/** Line art on a light background becomes lines in one colour on transparent (the illustrations on the page). */
export function lineTint(img: Img, colour: string, strength = 1): HTMLCanvasElement {
  const cv = work(), w = (img as HTMLImageElement).naturalWidth || img.width, h = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.min(1, 1400 / Math.max(w, h)); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
  const x = cv.getContext("2d")!; x.drawImage(img, 0, 0, cv.width, cv.height);
  const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data, [r, g, b] = hex(colour);
  for (let i = 0; i < p.length; i += 4) { const l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255; const a = Math.min(1, (1 - l) * 1.4 * strength) * (p[i + 3] / 255);
    p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = Math.round(a * 255); }
  x.putImageData(d, 0, 0); return cv;
}
const dims = (i: Img) => [(i as HTMLImageElement).naturalWidth || i.width, (i as HTMLImageElement).naturalHeight || i.height];
/** Draws a picture to cover (fill and crop) or fit a box. */
export function place(c: Ctx, i: Img, x: number, y: number, w: number, h: number, mode: "cover" | "fit" = "cover", ax = 0.5, ay = 0.5) {
  const [iw, ih] = dims(i); const s = mode === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * s, dh = ih * s; const dx = x + (w - dw) * ax, dy = y + (h - dh) * ay;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(i, dx, dy, dw, dh); c.restore();
}
export function circlePhoto(c: Ctx, i: Img, cx: number, cy: number, r: number) {
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip(); place(c, i, cx - r, cy - r, r * 2, r * 2, "cover", 0.5, 0.3); c.restore();
}
/** The illustration in the chosen style: lines tinted to a colour (default), or the picture as it is. */
function art(v: Vals, e: Env, colour: string): Img | null {
  const i = e.img(v.art ?? ""); if (!i) return null;
  return v.artMode === "full" ? i : lineTint(i, colour);
}
const bgOf = (v: Vals, e: Env, def: string) => v.bg === "navy" ? e.navy : v.bg && /^#/.test(v.bg) ? v.bg : def;
const subjectColour = (v: Vals, e: Env) => e.subjects.find((s) => s.name === v.subject)?.colour ?? "#3d7fd9";

// ---------- the templates ----------
const ART: Field[] = [{ k: "art", label: "Illustration", type: "image", hint: "From the library or Canva" }, { k: "artMode", label: "Illustration style", type: "mode" }];
export const TEMPLATES: Tpl[] = [
  { id: "course", group: "Courses & tasters", name: "New course", fields: [{ k: "course", label: "Course", type: "course" }, { k: "title", label: "Big title", type: "text", hint: "e.g. OLIVER TWIST" },
      { k: "top", label: "Top left", type: "area", hint: "e.g. KS3 Literature Classes\nStarting November!" }, { k: "when", label: "Top right", type: "text", hint: "e.g. Wednesdays @11.30am" }, ...ART, { k: "bg", label: "Background", type: "colour" }],
    caption: (v) => `${v.top?.replace(/\n/g, " ") ?? ""} ${v.when ? `(${v.when})` : ""}\n\n${v.title ? v.title + ": " : ""}book a place or a free taster lesson at OH-SO ED.`.trim(),
    draw(c, W, H, v, e) {
      const bg = bgOf(v, e, subjectColour(v, e)); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      const a = art(v, e, shade(bg, 0.55)); if (a) place(c, a, W * 0.2, H * 0.3, W * 0.8, H * 0.7, "fit", 1, 1);
      text(c, v.top ?? "", { x: 56, y: 44, w: W * 0.55, size: 30, lines: 3, lh: 1.15 });
      text(c, v.when ?? "", { x: W - 56, y: 44, w: W * 0.4, size: 30, align: "right", lines: 2 });
      text(c, v.title ?? "", { x: 52, y: H * 0.11, w: W - 104, size: 190, upper: true, lines: 2, lh: 0.92, colour: YELLOW, weight: 400 });
      brand(c, 56, H - 52, 44, WHITE, "left", family(v.subject || "English"));
    } },
  { id: "tasterweek", group: "Courses & tasters", name: "Taster week", fields: [{ k: "script", label: "Script words", type: "text", def: "Taster Week!" }, { k: "dates", label: "Dates", type: "text", def: "7–11 September!" },
      { k: "ages", label: "Levels and ages", type: "area", hint: "One per line: KS3 | Ages 11–12" }],
    caption: (v) => `${v.script || "Taster Week"} ${v.dates ?? ""}\n\nTry a live lesson for free: ${(v.ages ?? "").split("\n").map((l) => l.replace("|", "")).join(", ")}.`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); roundelRow(c, W, W * 0.02, e);
      script(c, v.script || "Taster Week!", W * 0.05, H * 0.36, 200, PINK, W * 0.9);
      let y = text(c, v.dates ?? "", { x: W - 60, y: H * 0.5, w: W * 0.7, size: 70, upper: true, align: "right", lines: 1 }) + 24;
      for (const l of (v.ages ?? "").split("\n").filter(Boolean).slice(0, 4)) {
        const [lv, ag] = l.split("|").map((x) => x.trim()); c.font = `400 50px "${SANS}"`; c.textAlign = "right";
        const aw = c.measureText(ag ?? "").width; c.fillStyle = YELLOW; c.fillText(ag ?? "", W - 60, y + 46); c.fillStyle = WHITE; c.fillText((lv ?? "") + " ", W - 60 - aw, y + 46); y += 64;
      }
      brand(c, 56, H - 56, 44, WHITE);
    } },
  { id: "taster", group: "Courses & tasters", name: "Free taster lesson", fields: [{ k: "lines", label: "Big words", type: "area", def: "Try a free\n*Taster*\nlesson!", hint: "Put *stars* round the pink word" }],
    caption: () => "Not sure yet? Try a free live taster lesson with our teachers.",
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); roundelCluster(c, W, H * 0.22, H * 0.42, e);
      text(c, v.lines || "Try a free\n*Taster*\nlesson!", { x: 56, y: H * 0.33, w: W * 0.66, size: 120, upper: true, lines: 4, lh: 1.0 }, PINK);
      brand(c, 56, H - 56, 44, WHITE);
    } },
  { id: "offer", group: "Courses & tasters", name: "Offer / Enrol now", fields: [{ k: "lines", label: "Capitals", type: "area", def: "New courses\nstarting\nSeptember!" }, { k: "script", label: "Pink script", type: "text", def: "50% off" },
      { k: "script2", label: "Blue script", type: "text", def: "Enrol now" }, ...ART],
    caption: (v) => `${(v.lines ?? "").replace(/\n/g, " ")}: ${v.script ?? ""}. ${v.script2 ?? ""}!`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); roundelRow(c, W, W * 0.02, e);
      const a = art(v, e, SKY); if (a) place(c, a, W * 0.55, H * 0.2, W * 0.4, H * 0.3, "fit", 1, 0.5);
      const y = text(c, v.lines || "", { x: 52, y: H * 0.2, w: W * 0.62, size: 92, upper: true, lines: 4, lh: 1.0 });
      script(c, v.script || "", W * 0.08, Math.max(y + 110, H * 0.62), 190, PINK, W * 0.8);
      script(c, v.script2 || "", W * 0.12, Math.max(y + 300, H * 0.82), 150, SKY, W * 0.62);
      brand(c, W - 56, H - 56, 40, WHITE, "right");
    } },
  { id: "stilltime", group: "Courses & tasters", name: "There’s still time", fields: [{ k: "lines", label: "Capitals", type: "area", def: "There’s\nstill" }, { k: "script", label: "Pink script", type: "text", def: "Time!" },
      { k: "small", label: "Small line", type: "text", def: "… to enrol or trial a lesson with us!" }],
    caption: (v) => `There’s still time ${v.small?.replace(/^…\s*/, "") ?? ""}`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); roundelCluster(c, W, H * 0.5, H * 0.8, e); brand(c, 56, 90, 40, WHITE);
      const y = text(c, v.lines || "", { x: 52, y: H * 0.22, w: W * 0.6, size: 120, upper: true, lines: 3, lh: 1.0 });
      script(c, v.script || "", W * 0.06, y + 120, 260, PINK, W * 0.7);
      text(c, v.small ?? "", { x: 56, y: H - 140, w: W * 0.55, size: 38, lines: 2 });
    } },
  { id: "hello", group: "People", name: "Hello! Meet the teacher", fields: [{ k: "teacher", label: "Teacher", type: "teacher" }, { k: "intro", label: "Introduction", type: "area", hint: "Put *stars* round the yellow words" }, { k: "subject2", label: "Subject (roundel name)", type: "text" }, { k: "bg", label: "Background", type: "colour" }],
    caption: (v) => (v.intro ?? "").replace(/\*/g, "") + "\n\nMeet the team at OH-SO ED.",
    draw(c, W, H, v, e) {
      const bg = bgOf(v, e, e.subjects.find((s) => family(s.name) === (v.subject2 || ""))?.colour ?? "#3d7fd9"); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      const p = e.photos("teacher")[0]; if (p) { const d = duotone(p, bg); place(c, d, W * 0.36, H * 0.2, W * 0.64, H * 0.8, "cover", 0.5, 0.2);
        const g = c.createLinearGradient(W * 0.36, 0, W * 0.5, 0); g.addColorStop(0, bg); g.addColorStop(1, bg + "00"); c.fillStyle = g; c.fillRect(W * 0.36, H * 0.2, W * 0.15, H * 0.8); }
      text(c, "Hello!", { x: W / 2, y: 30, w: W - 20, size: 260, upper: true, align: "center", lines: 1, colour: YELLOW });
      text(c, v.intro ?? "", { x: 52, y: H * 0.38, w: W * 0.4, size: 40, lines: 8, lh: 1.15 }, YELLOW);
      brand(c, W - 56, H - 52, 46, WHITE, "right", v.subject2 || undefined);
    } },
  { id: "person", group: "People", name: "Meet the Principal / event", fields: [{ k: "teacher", label: "Person", type: "teacher" }, { k: "label", label: "Small label", type: "text", def: "Parents Evening" },
      { k: "script", label: "Pink script", type: "text", def: "Meet The Principal" }],
    caption: (v) => `${v.label ?? ""}: ${v.script ?? ""}.`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); const p = e.photos("teacher")[0];
      if (p) circlePhoto(c, duotone(p, SKY), W * 0.29, H * 0.27, W * 0.3);
      text(c, v.label ?? "", { x: W - 50, y: 50, w: W * 0.4, size: 40, align: "right", lines: 2 });
      script(c, v.script || "", W * 0.05, H * 0.66, 170, PINK, W * 0.95, -14);
      brand(c, W / 2, H - 70, 76, WHITE, "center");
    } },
  { id: "thanks", group: "People", name: "Thank you (team)", fields: [{ k: "people", label: "People", type: "teachers" }, { k: "script", label: "Pink script", type: "text", def: "Thank You!" }],
    caption: () => "A huge thank you from all of us at OH-SO ED.",
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); const ps = e.photos("people"); const n = Math.max(1, ps.length); const r = Math.min(W / (n * 2.1), W * 0.16);
      ps.forEach((p, i) => circlePhoto(c, duotone(p, SKY), W / 2 + (i - (n - 1) / 2) * r * 2.08, r * 0.95, r));
      script(c, v.script || "", W * 0.06, H * 0.56, 230, PINK, W * 0.9, -10);
      brand(c, W / 2, H - 80, 64, WHITE, "center");
    } },
  { id: "hiring", group: "People", name: "We’re hiring", fields: [{ k: "question", label: "Question", type: "area", def: "Are you an outstanding practitioner in *Computer Studies*?" },
      { k: "ticks", label: "Requirements", type: "area", def: "Secondary QTS in specialism\n5+ years UK secondary teaching experience\nProficient online teacher" }, ...ART],
    caption: (v) => `We’re hiring! ${(v.question ?? "").replace(/\*/g, "")}\n\n${(v.ticks ?? "").split("\n").filter(Boolean).map((t) => "✔️ " + t).join("\n")}\n\nApply on our website.`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); const a = art(v, e, SKY); if (a) place(c, a, 30, H * 0.06, W * 0.36, H * 0.62, "fit", 0, 0.5);
      text(c, v.question ?? "", { x: W - 56, y: H * 0.07, w: W * 0.56, size: 62, align: "right", lines: 4, lh: 1.08 }, PINK);
      let y = H * 0.55;
      for (const t of (v.ticks ?? "").split("\n").filter(Boolean).slice(0, 4)) {
        c.beginPath(); c.arc(W - 80, y + 18, 22, 0, Math.PI * 2); c.lineWidth = 4; c.strokeStyle = PINK; c.stroke();
        c.beginPath(); c.moveTo(W - 92, y + 18); c.lineTo(W - 82, y + 28); c.lineTo(W - 66, y + 8); c.stroke();
        text(c, t, { x: W - 120, y: y, w: W * 0.55, size: 30, align: "right", lines: 1 }); y += 72;
      }
      brand(c, 56, H - 70, 40, WHITE); text(c, "Online school", { x: 58, y: H - 60, w: 300, size: 18, upper: true, ls: 0.3, lines: 1 });
    } },
  { id: "keydate", group: "Events & dates", name: "Awareness day / key date", fields: [{ k: "title", label: "Title", type: "area", def: "International Literacy Day!" }, { k: "date", label: "Date", type: "text", hint: "e.g. 8th September" }, ...ART],
    caption: (v) => `${(v.title ?? "").replace(/\n/g, " ")} ${v.date ? "(" + v.date + ")" : ""}`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); const a = art(v, e, tint(e.navy, 0.35)); if (a) place(c, a, W * 0.35, H * 0.05, W * 0.65, H * 0.95, "fit", 1, 1);
      const y = text(c, v.title ?? "", { x: 52, y: H * 0.1, w: W * 0.8, size: 110, lines: 4, lh: 1.02, colour: PINK });
      text(c, v.date ?? "", { x: 56, y: y + 20, w: W * 0.6, size: 52, lines: 1 });
      brand(c, W - 56, H - 56, 40, WHITE, "right");
    } },
  { id: "week", group: "Events & dates", name: "Awareness week (capitals)", fields: [{ k: "title", label: "Title", type: "area", def: "World Wellbeing Week" }, ...ART],
    caption: (v) => `It’s ${(v.title ?? "").replace(/\n/g, " ")}!`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); const i = e.img(v.art ?? ""); if (i) place(c, v.artMode === "line" ? lineTint(i, SKY) : i, W * 0.45, H * 0.4, W * 0.55, H * 0.6, "fit", 1, 1);
      text(c, v.title ?? "", { x: 52, y: H * 0.12, w: W * 0.8, size: 120, upper: true, lines: 4, lh: 0.98, colour: SKY });
      brand(c, 56, H - 56, 40, WHITE);
    } },
  { id: "workshop", group: "Events & dates", name: "Workshop", fields: [{ k: "small", label: "Small top line", type: "text", def: "Free" }, { k: "title", label: "Title", type: "text", hint: "e.g. Narnia" },
      { k: "sub", label: "Under the title", type: "text", def: "KS3 Workshop" }, { k: "subject2", label: "Subject (roundel name)", type: "text", def: "English" }, { k: "art", label: "Picture", type: "image" }],
    caption: (v) => `${v.small ? v.small + " " : ""}${v.sub ?? "workshop"}: ${v.title ?? ""}. Book a place on our website.`,
    draw(c, W, H, v, e) {
      c.fillStyle = "#111"; c.fillRect(0, 0, W, H); const i = e.img(v.art ?? ""); if (i) place(c, i, 0, 0, W, H, "cover");
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(0.35, "rgba(0,0,0,0)"); g.addColorStop(0.7, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.6)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
      text(c, v.small ?? "", { x: W / 2, y: 30, w: W * 0.5, size: 34, upper: true, align: "center", lines: 1, ls: 0.08 });
      const y = text(c, v.title ?? "", { x: W / 2, y: 80, w: W * 0.9, size: 120, upper: true, align: "center", lines: 1, colour: GOLD, ls: 0.04 });
      text(c, v.sub ?? "", { x: W / 2, y: y + 6, w: W * 0.8, size: 46, upper: true, align: "center", lines: 1, colour: WHITE, ls: 0.04 });
      brand(c, W / 2, H - 50, 52, WHITE, "center", v.subject2 || undefined);
    } },
  { id: "announce", group: "Events & dates", name: "Announcement (e.g. free recordings)", fields: [{ k: "script", label: "Script word", type: "text", def: "Free" }, { k: "title", label: "Pink capitals", type: "area", def: "Lesson recordings" }],
    caption: (v) => `${v.script ?? ""} ${(v.title ?? "").toLowerCase()} for every OH-SO ED student.`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); script(c, v.script || "", W * 0.08, H * 0.24, 200, WHITE, W * 0.6, -10);
      const y = text(c, v.title ?? "", { x: 40, y: H * 0.33, w: W - 80, size: 120, upper: true, lines: 2, lh: 1.0, colour: PINK });
      brand(c, W / 2, Math.max(y + 90, H * 0.66), 56, WHITE, "center"); roundelRow(c, W, H - W * 0.02, e);
    } },
  { id: "results", group: "Celebrations", name: "Results are in", fields: [{ k: "title", label: "Capitals", type: "area", def: "The results are in!" }, { k: "small", label: "Line under", type: "text", def: "Well done to all of our students!" },
      { k: "script", label: "Pink script", type: "text", def: "You smashed it!" }],
    caption: (v) => `${v.title ?? ""} ${v.small ?? ""} 🎉`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H);
      const y = text(c, v.title ?? "", { x: W / 2, y: H * 0.12, w: W - 80, size: 110, upper: true, align: "center", lines: 2, lh: 1.0, colour: SKY });
      text(c, v.small ?? "", { x: 56, y: y + 30, w: W * 0.6, size: 52, lines: 2 });
      script(c, v.script || "", W * 0.12, H * 0.7, 200, PINK, W * 0.85, -10);
      brand(c, W - 56, H - 56, 44, WHITE, "right");
    } },
  { id: "welcome", group: "Celebrations", name: "Welcome back / end of term", fields: [{ k: "title", label: "Pink capitals", type: "area", def: "Welcome back" }, { k: "script", label: "Script line", type: "text", def: "Term 2" },
      { k: "art", label: "Photo or illustration", type: "image" }, { k: "artMode", label: "Picture style", type: "mode" }],
    caption: (v) => `${v.title ?? ""}${v.script ? " – " + v.script : ""}!`,
    draw(c, W, H, v, e) {
      c.fillStyle = e.navy; c.fillRect(0, 0, W, H); const i = e.img(v.art ?? "");
      if (i) { const d = v.artMode === "line" ? lineTint(i, SKY) : v.artMode === "full" ? i : duotone(i, SKY); place(c, d, 0, H * 0.4, W, H * 0.6, v.artMode === "line" ? "fit" : "cover", 0.5, 0.3); }
      const y = text(c, v.title ?? "", { x: 52, y: H * 0.07, w: W - 104, size: 150, upper: true, lines: 2, lh: 0.95, colour: PINK });
      script(c, v.script || "", W * 0.08, y + 80, 140, WHITE, W * 0.8, -6);
      brand(c, W - 56, H - 50, 44, WHITE, "right");
    } },
  { id: "subject", group: "Celebrations", name: "Subject banner", fields: [{ k: "subject", label: "Subject", type: "course" }, { k: "script", label: "Yellow script", type: "text", def: "Beyond the page" }, ...ART],
    caption: (v) => `${v.script ?? ""} ✨`,
    draw(c, W, H, v, e) {
      const bg = subjectColour(v, e); c.fillStyle = bg; c.fillRect(0, 0, W, H); const a = art(v, e, shade(bg, 0.45)); if (a) place(c, a, 0, 0, W, H, "cover");
      script(c, v.script || "", W * 0.05, H * 0.45, 170, YELLOW, W * 0.92, -6);
      brand(c, W / 2, H * 0.72, 76, WHITE, "center", family(v.subject || "English"));
    } },
];

export const SIZES = { square: { name: "Square post", w: 1080, h: 1080 }, portrait: { name: "Portrait post", w: 1080, h: 1350 }, story: { name: "Story / Reel", w: 1080, h: 1920 } } as const;
export type SizeKey = keyof typeof SIZES;
