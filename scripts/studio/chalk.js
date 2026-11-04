/* Chalk renderer: turns a drawing spec (simple shapes, back to front) into the OH-SO ED hand-drawn blue chalk style. */
(function (root) {
  const TONE = { deep: "#0A1C45", dark: "#11295A", mid: "#22508C", light: "#4479B8", pale: "#93BDEA", hi: "#D3E6FA", ink: "#020920" };
  const NAVY = "#040F2D", WHITE = "#FFFFFF";
  const SUBJECTS = {
    english: ["English", "#008CDB", "#020737", "#09A6FF"], maths: ["Maths", "#14AF7C", "#023222", "#15FFB2"], geography: ["Geography", "#FF914D", "#602500", "#FFA66F"],
    history: ["History", "#804AC2", "#411B70", "#A65EFF"], science: ["Science", "#CDC100", "#393603", "#FFF001"], business: ["Business", "#9FB4CD", "#263342", "#B5D7FF"],
    media: ["Media", "#CF65A6", "#40132F", "#FF89D1"], economics: ["Economics", "#506FA6", "#12274B", "#89B3FD"], technology: ["Technology", "#0CC0DF", "#005B6B", "#1BDEFF"] };
  const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
  /** The colours one drawing uses: tones from the subject's shade up to its main colour and lighter tints, its highlight, and the dark background. */
  /** onColour: the drawing sits on the subject's main colour (like the course posters), so its tones run from the shade
   *  up to just below the main colour, and the light catches it in tints and the highlight colour. */
  // the school's own tweaks to the swatches (main, shade, highlight, white), set from Sketch Studio's colour editor
  let OVR = {};
  const isHex = (v) => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
  function setPalettes(o) { OVR = {}; for (const [k, v] of Object.entries(o || {})) if (v && typeof v === "object") { const c = {}; for (const f of ["main", "shade", "highlight", "white"]) if (isHex(v[f])) c[f] = v[f].toUpperCase(); if (Object.keys(c).length) OVR[k] = c; } }
  /** The standard swatches, before any tweaks. House blue's "main" is its navy background. */
  function defaults(key) {
    if (!SUBJECTS[key]) return { main: NAVY, shade: "#0A1C45", highlight: "#8FD3FF", white: "#EAF6FF" };
    const [, M, S, H] = SUBJECTS[key]; return { main: M, shade: S, highlight: H, white: mix(H, "#FFFFFF", 0.82) };
  }
  const swatch = (key) => Object.assign(defaults(key), OVR[key] || {});
  function palette(key, onColour) {
    const house = !SUBJECTS[key], sw = swatch(key);
    const name = house ? "House blue" : SUBJECTS[key][0], M = sw.main, S = sw.shade, H = sw.highlight;
    if (onColour && house) {
      const t = Object.assign({}, TONE);
      if (OVR.house && OVR.house.shade) { t.ink = mix(S, "#000000", 0.55); t.deep = S; t.dark = mix(S, "#4479B8", 0.15); t.mid = mix(S, "#4479B8", 0.55); }
      return Object.assign(t, { name, swatch: [M, S, H, sw.white], bg: M, hl: H, white: sw.white, pool: mix(M, "#4479B8", 0.35), key: mix(M, "#4479B8", 0.3) });
    }
    if (onColour) return { name, swatch: [M, S, H, sw.white], bg: M, white: sw.white,
      ink: mix(S, "#000000", 0.5), deep: mix(S, "#000000", 0.25), dark: S, mid: mix(S, M, 0.16), light: mix(S, M, 0.32), pale: mix(S, M, 0.5), hi: mix(M, "#FFFFFF", 0.45),
      hl: H, pool: mix(M, S, 0.35) };
    if (house) return Object.assign({}, TONE, { hl: "#7FD0FF", white: "#F2FAFF", bg: WHITE, pool: "#C7DBF2", name: "House blue", swatch: ["#4479B8", "#0A1C45", "#7FD0FF", "#FFFFFF"] });
    return { name, swatch: [M, S, H, "#FFFFFF"], white: mix(H, "#FFFFFF", 0.82), ink: mix(S, "#000000", 0.45), deep: S, dark: mix(S, M, 0.33), mid: mix(S, M, 0.66), light: M, pale: mix(M, "#FFFFFF", 0.45), hi: mix(M, "#FFFFFF", 0.78),
      hl: H, bg: WHITE, pool: mix(M, "#FFFFFF", 0.7) };
  }
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const tone = (t, d) => TONE[t] || TONE[d] || TONE.mid;
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function build(spec, opts) {
    const W = Math.round(Math.min(2400, Math.max(400, num(spec.width, 1400)))), H = Math.round(Math.min(2400, Math.max(400, num(spec.height, 1200))));
    const light = (opts.bg || "white") === "white";   // otherwise ("navy", kept for saved drawings) the subject's main colour
    const TONE = palette(opts.palette, !light), tone = (t, d) => TONE[t] || TONE[d] || TONE.mid;
    const HL = opts.highlight === "soft" || opts.highlight === "glow" ? opts.highlight : "off", HC = HL === "off" ? TONE.hi : TONE.hl;
    const BG = TONE.bg;
    const glowAttr = HL === "glow" ? ' filter="url(#hlglow)"' : "";
    const R = rng(num(opts.seed, 7)), U = (a, b) => a + (b - a) * R();
    const out = [], defs = []; let cid = 0; const bb = [1e9, 1e9, -1e9, -1e9];
    const f = (n) => (Math.round(n * 10) / 10).toString();
    const P = (pts) => "M" + pts.map((p) => f(p[0]) + " " + f(p[1])).join(" L") + " Z";
    const grow = (pts) => { for (const [x, y] of pts) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); } };
    const ell = (cx, cy, rx, ry, a0 = 0, a1 = 360, n = 64) => { const pts = [], full = a1 - a0 === 360; for (let i = 0; i < n + (full ? 0 : 1); i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return pts; };
    const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    function cr(pts, closed, per = 8) {
      const n = pts.length, out2 = []; if (n < 3) return pts.slice();
      const g = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
      for (let i = 0; i < (closed ? n : n - 1); i++) { const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
        for (let k = 0; k < per; k++) { const t = k / per, t2 = t * t, t3 = t2 * t;
          out2.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                     0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); } }
      if (!closed) out2.push(pts[n - 1]); return out2;
    }
    function rrect(x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); if (!r) return rect(x, y, w, h);
      const q = [], c = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
      for (const [cx, cy, a0] of c) for (let i = 0; i <= 6; i++) { const a = (a0 + 90 * i / 6) * Math.PI / 180; q.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      return q; }
    let M = [1, 0, 0, 1, 0, 0];   // current group transform, for the bounding box only
    const tp = (pts) => pts.map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);

    function wobbly(a, b, amp = 1.3, over = 6, step = 18, bow = 0) {
      let [x1, y1] = a, [x2, y2] = b; let L = Math.hypot(x2 - x1, y2 - y1) || 1; const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      x1 -= ux * over * R(); y1 -= uy * over * R(); x2 += ux * over * R(); y2 += uy * over * R();
      L = Math.hypot(x2 - x1, y2 - y1); const n = Math.max(2, Math.floor(L / step)), nx = -uy, ny = ux; const pts = [];
      const bw = bow * L * U(-1, 1);
      for (let i = 0; i <= n; i++) { const t = i / n, j = U(-amp, amp) + bw * 4 * t * (1 - t); pts.push([x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j]); }
      return "M" + pts.map((p) => f(p[0]) + " " + f(p[1])).join(" L");
    }
    function outline(pts, col = TONE.ink, w = 2.6, closed = true, passes = 3, op = 0.95, over = 10) {
      const n = pts.length, W = [1.35, 0.75, 0.45], O = [1, 0.75, 0.55], J = [1.4, 2.4, 3.2];
      for (let p = 0; p < passes; p++) {
        const ww = w * W[p % 3], oo = op * O[p % 3], jj = J[p % 3];
        if (n > 16) { const off = [U(-1.5, 1.5), U(-1.5, 1.5)]; const d = "M" + pts.map(([x, y]) => f(x + off[0] + U(-jj, jj) * 0.6) + " " + f(y + off[1] + U(-jj, jj) * 0.6)).join(" L") + (closed ? " Z" : ""); out.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(ww)}" opacity="${oo.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`); }
        else for (let i = 0; i < (closed ? n : n - 1); i++) out.push(`<path d="${wobbly(pts[i], pts[(i + 1) % n], jj, over * (1 + p * 0.5), 16, 0.012)}" fill="none" stroke="${col}" stroke-width="${f(ww)}" opacity="${oo.toFixed(2)}" stroke-linecap="round"/>`);
      }
    }
    function clip(pts) { const k = "c" + (++cid); defs.push(`<clipPath id="${k}"><path d="${P(pts)}"/></clipPath>`); return k; }
    function hatch(pts, h) {
      const ang = num(h.angle, 38), sp = Math.max(3, num(h.spacing, 7)), op = Math.min(1, Math.max(0, num(h.strength, 0.35))), col = HL === "glow" && h.color === "hi" ? TONE.hl : tone(h.color, "pale");
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const Rr = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 10; const lines = [];
      const side = h.side || (h.lit === false ? "all" : "lit"), sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys);
      for (const a of [ang].concat(typeof h.cross === "number" ? [h.cross] : [])) {
        const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
        for (let t = -Rr; t < Rr; t += sp * U(0.8, 1.25)) {
          const off = t + U(-sp * 0.3, sp * 0.3), L = Rr * U(0.75, 1), st = -Rr + U(0, Rr * 0.25);
          const x1 = cx + ca * st - sa * off, y1 = cy + sa * st + ca * off, x2 = cx + ca * (st + 2 * L) - sa * off, y2 = cy + sa * (st + 2 * L) + ca * off;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const k = (mx - cx) / (sx || 1) + (my - cy) / (sy || 1);
          if (side === "lit" && k > 0.25 + U(-0.12, 0.12)) continue;      // the lit (upper-left) side
          if (side === "shadow" && k < -0.05 + U(-0.12, 0.12)) continue;  // the side away from the light
          const bright = HL !== "off" && side === "lit" && h.color === "hi" && R() < 0.22;
          lines.push(`<path d="${wobbly([x1, y1], [x2, y2], 1.1, 0, 26, 0.03)}" stroke-width="${(num(h.width, 1.6) * U(0.5, 1.3)).toFixed(2)}" opacity="${(bright ? 0.8 : op * U(0.45, 1.15)).toFixed(2)}"${bright ? ` stroke="${TONE.white}"` : ""}/>`);
        }
      }
      out.push(`<g clip-path="url(#${clip(pts)})" stroke="${col}" fill="none" stroke-linecap="round">${lines.join("")}</g>`);
    }
    function shade(pts, kind) {
      if (kind === "none") return;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const k = "g" + (++cid); const [ax, ay, bx, by] = kind === "tb" ? [0, y0, 0, y1] : kind === "diag" ? [x0, y0, x1, y1] : [x0, 0, x1, 0];
      defs.push(`<linearGradient id="${k}" gradientUnits="userSpaceOnUse" x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}"><stop offset="0" stop-color="${light ? TONE.hi : TONE.pale}" stop-opacity="${light ? 0.45 : 0.35}"/><stop offset="1" stop-color="${TONE.deep}" stop-opacity="0.8"/></linearGradient>`);
      out.push(`<g clip-path="url(#${clip(pts)})"><path d="${P(pts)}" fill="url(#${k})" filter="url(#smudge)"/></g>`);
    }
    function stripes(pts, s) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const w = Math.max(10, num(s.width, 90)), sl = num(s.slant, 40), cs = (Array.isArray(s.colors) ? s.colors : ["pale", "deep"]).map((c) => tone(c, "pale")); const g = [];
      for (let x = x0 - 300, i = 0; x < x1 + 300; x += w, i++) g.push(`<path d="${P([[x, y1], [x + w, y1], [x + w + sl, y0], [x + sl, y0]])}" fill="${cs[i % cs.length]}"/>`);
      out.push(`<g clip-path="url(#${clip(pts)})">${g.join("")}</g>`);
    }
    function rim(a, b) {
      out.push(`<path d="${wobbly(a, b, 1.6, 4, 16, 0.01)}" stroke="${HC}" stroke-width="${HL === "off" ? 3 : 3.4}" opacity="${HL === "off" ? 0.85 : 0.95}" fill="none" stroke-linecap="round"${glowAttr}/>`);
      if (HL !== "off") { const t0 = U(0.05, 0.3), t1 = U(0.6, 0.95); out.push(`<path d="${wobbly([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], 1, 2, 16, 0.01)}" stroke="${TONE.white}" stroke-width="1.5" opacity="0.9" fill="none" stroke-linecap="round"/>`); }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 40) return; const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (let k = 0; k < 2; k++) { const t0 = U(0, 0.5), t1 = Math.min(1, t0 + U(0.25, 0.5)), o = U(2.5, 5) * (k ? -1 : 1);
        const p0 = [a[0] + (b[0] - a[0]) * t0 + nx * o, a[1] + (b[1] - a[1]) * t0 + ny * o], p1 = [a[0] + (b[0] - a[0]) * t1 + nx * o, a[1] + (b[1] - a[1]) * t1 + ny * o];
        out.push(`<path d="${wobbly(p0, p1, 1.2, 2, 14, 0.02)}" stroke="${HC}" stroke-width="${U(1.2, 2).toFixed(1)}" opacity="${U(0.45, 0.75).toFixed(2)}" fill="none" stroke-linecap="round"/>`); }
    }
    // highlight mode: the light catches every edge that faces the upper left, like the rim light on the home page's hero
    function autoRim(pts) {
      let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (Math.abs(area) / 2 < 1800) return; const sgn = area > 0 ? 1 : -1, runs = []; let run = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = sgn * (b[1] - a[1]) / L, ny = -sgn * (b[0] - a[0]) / L;                 // outward normal
        if ((-nx - ny) / Math.SQRT2 > 0.35) { const ins = HL === "glow" ? 3 : 2.5; if (!run.length) run.push([a[0] - nx * ins, a[1] - ny * ins]); run.push([b[0] - nx * ins, b[1] - ny * ins]); }
        else if (run.length) { runs.push(run); run = []; }
      }
      if (run.length) runs.push(run);
      for (const r of runs) { if (r.length < 2) continue; const d = "M" + r.map(([x, y]) => f(x + U(-0.8, 0.8)) + " " + f(y + U(-0.8, 0.8))).join(" L");
        out.push(`<path d="${d}" stroke="${TONE.hl}" stroke-width="${HL === "glow" ? 3.2 : 2.4}" opacity="${HL === "glow" ? 0.95 : 0.75}" fill="none" stroke-linecap="round" stroke-linejoin="round"${glowAttr}/>`);
        if (r.length > 3) { const cut = r.slice(Math.floor(r.length * U(0.1, 0.3)), Math.ceil(r.length * U(0.6, 0.9))); if (cut.length > 1) out.push(`<path d="M${cut.map(([x, y]) => f(x) + " " + f(y)).join(" L")}" stroke="${TONE.white}" stroke-width="1.3" opacity="0.85" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`); } }
    }
    // a filled shape with the house treatment: fill, light falloff, chalk hatching, stripes, ink outline
    function shape(pts, p, defTone = "mid") {
      grow(tp(pts));
      out.push(`<path d="${P(pts)}" fill="${tone(p.tone, defTone)}"/>`);
      if (p.stripes) stripes(pts, p.stripes);
      shade(pts, p.shade || "lr");
      if (p.hatch !== false) hatch(pts, Object.assign({ strength: { deep: 0.25, dark: 0.3, mid: 0.42, light: 0.5, pale: 0.45, hi: 0.3 }[p.tone] || 0.38 }, p.hatch || {}));
      if (p.hatch !== false && p.shadowHatch !== false && p.tone !== "deep") hatch(pts, { angle: num((p.hatch || {}).angle, 38) - 75, spacing: 5, strength: 0.32, color: "ink", side: "shadow", width: 1.5 });
      if (p.outline !== false) outline(pts, TONE.ink, num(p.lineWidth, 2.6));
      if (HL !== "off" && p.rimLight !== false && !["deep", "ink"].includes(p.tone)) autoRim(pts);
    }
    function smoothPath(pts) {
      if (pts.length < 3) return "M" + pts.map((p) => f(p[0]) + " " + f(p[1])).join(" L");
      let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
      for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`; }
      return d;
    }
    const pt = (a) => (Array.isArray(a) && a.length >= 2 ? [num(a[0], 0), num(a[1], 0)] : [0, 0]);
    const pts = (a) => (Array.isArray(a) ? a.slice(0, 400).map(pt) : []);
    let count = 0;
    function draw(p) {
      if (!p || typeof p !== "object" || ++count > 1500) return;
      const t = p.type;
      if (t === "group") {
        const o = pt(p.origin || [0, 0]), tr = pt(p.translate || [0, 0]), rot = num(p.rotate, 0), sc = num(p.scale, 1);
        const old = M; const r = rot * Math.PI / 180, c = Math.cos(r) * sc, s = Math.sin(r) * sc;
        const L = [c, s, -s, c, tr[0] + o[0] - c * o[0] + s * o[1], tr[1] + o[1] - s * o[0] - c * o[1]];
        M = [old[0] * L[0] + old[2] * L[1], old[1] * L[0] + old[3] * L[1], old[0] * L[2] + old[2] * L[3], old[1] * L[2] + old[3] * L[3], old[0] * L[4] + old[2] * L[5] + old[4], old[1] * L[4] + old[3] * L[5] + old[5]];
        out.push(`<g transform="translate(${f(tr[0])} ${f(tr[1])}) rotate(${f(rot)} ${f(o[0])} ${f(o[1])}) translate(${f(o[0])} ${f(o[1])}) scale(${sc}) translate(${f(-o[0])} ${f(-o[1])})">`);
        (Array.isArray(p.parts) ? p.parts : []).forEach(draw); out.push("</g>"); M = old; return;
      }
      if (t === "rect") { const x = num(p.x, 0), y = num(p.y, 0), w = num(p.w, 100), h = num(p.h, 100); const q = p.radius ? rrect(x, y, w, h, num(p.radius, 0)) : rect(x, y, w, h); shape(q, p); if (p.rim) { rim([x, y + 4], [x, y + h - 4]); rim([x + 4, y], [x + w - 4, y]); } return; }
      if (t === "poly" || t === "shape") { let q = pts(p.points); if (q.length < 3) return; if (t === "shape" || p.smooth) q = cr(q, true); shape(q, p); return; }
      if (t === "strip") {   // a ribbon of even width along a smooth centre line: film strips, belts, ribbons, scarves, tape
        const c = cr(pts(p.points), false, 14); if (c.length < 2) return; const w = num(p.width, 120) / 2;
        const cum = [0]; for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])); const LEN = cum[cum.length - 1];
        const at = (s2, v) => { s2 = Math.max(0, Math.min(LEN, s2)); let i = 1; while (i < c.length - 1 && cum[i] < s2) i++;
          const a = c[i - 1], b = c[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = (s2 - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
          const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; return [a[0] + (b[0] - a[0]) * k + nx * v * w, a[1] + (b[1] - a[1]) * k + ny * v * w]; };
        const band = (s0, s1, v0, v1, n) => { n = n || Math.max(2, Math.ceil((s1 - s0) / 12)); const a = [], b = [];
          for (let i = 0; i <= n; i++) { a.push(at(s0 + (s1 - s0) * i / n, v0)); b.push(at(s1 - (s1 - s0) * i / n, v1)); } return a.concat(b); };
        shape(band(0, LEN, -1, 1, Math.ceil(LEN / 10)), Object.assign({ tone: "deep", shade: "none", hatch: { angle: 30, spacing: 7, strength: 0.22, color: "light", lit: false } }, p));
        const hasHoles = !!p.holes, fr = p.frames;
        if (hasHoles) for (let s2 = 16; s2 < LEN - 14; s2 += 26) for (const [v0, v1] of [[-0.9, -0.74], [0.74, 0.9]]) {
          const q = band(s2, s2 + 13, v0, v1, 2); out.push(`<path d="${P(q)}" fill="${light ? BG : TONE.ink}"/>`); outline(q, light ? TONE.mid : TONE.pale, 1.2, true, 1, 0.6, 0); }
        if (fr && typeof fr === "object") { const FL = Math.max(30, num(fr.length, 150)), GP = num(fr.gap, 16), v0 = hasHoles ? -0.64 : -0.8, v1 = -v0;
          for (let s2 = num(fr.start, 40); s2 + FL - GP <= LEN; s2 += FL) { const q = band(s2, s2 + FL - GP, v0, v1);
            out.push(`<path d="${P(q)}" fill="${tone(fr.tone, "pale")}"/>`); hatch(q, { angle: 40, spacing: 6, strength: 0.3, color: "hi" }); outline(q, TONE.ink, 1.6, true, 1, 0.8, 0); } }
        out.push(`<path d="${smoothPath(c.map((_, i) => at(cum[i], -0.97)).filter((_, i) => i % 3 === 0))}" stroke="${HC}" stroke-width="2.6" fill="none" opacity="0.85"${glowAttr}/>`);
        return;
      }
      if (t === "sector") {   // a filled slice of an ellipse: lamp shades, fans, pie wedges, half-domes
        const cx = num(p.cx, 0), cy = num(p.cy, 0), rx = num(p.rx, num(p.r, 80)), ry = num(p.ry, num(p.r, rx));
        const q = [[cx, cy]].concat(ell(cx, cy, rx, ry, num(p.from, 180), num(p.to, 360), 40)); shape(q, Object.assign({ shade: "diag" }, p)); return; }
      if (t === "ellipse" || t === "circle") { const rx = num(p.rx, num(p.r, 50)), ry = num(p.ry, num(p.r, rx)); const q = ell(num(p.cx, 0), num(p.cy, 0), rx, ry); shape(q, Object.assign({ shade: "diag" }, p));
        if (p.rim) out.push(`<path d="M${ell(num(p.cx, 0), num(p.cy, 0), rx - 4, ry - 4, 160, 290, 30).map((a) => f(a[0]) + " " + f(a[1])).join(" L")}" stroke="${HC}" stroke-width="3" opacity="0.85" fill="none" stroke-linecap="round"${glowAttr}/>`); return; }
      if (t === "box") {
        const x = num(p.x, 0), y = num(p.y, 0), w = num(p.w, 200), h = num(p.h, 150), d = pt(p.depth || [60, -35]);
        shape([[x + w, y], [x + w + d[0], y + d[1]], [x + w + d[0], y + h + d[1]], [x + w, y + h]], { tone: "deep", hatch: { angle: 60, spacing: 9, strength: 0.22, lit: false }, shade: "none" });
        shape([[x, y], [x + w, y], [x + w + d[0], y + d[1]], [x + d[0], y + d[1]]], { tone: p.topTone || "light", hatch: { angle: 0, spacing: 5, strength: 0.8, color: "hi", lit: false }, shade: "none" });
        shape(rect(x, y, w, h), Object.assign({ shade: "diag", hatch: { angle: 38, spacing: 7, strength: 0.42, cross: -48 } }, p));
        rim([x, y + 4], [x, y + h - 4]); rim([x, y], [x + d[0], y + d[1]]); return;
      }
      if (t === "cylinder") {
        const ax = p.axis === "horizontal";
        if (!ax) { const cx = num(p.cx, 0), top = num(p.top, 0), bot = num(p.bottom, 200), r = num(p.r, 80), ry = num(p.ry, r * 0.26);
          const body = [[cx - r, top], [cx - r, bot]].concat(Array.from({ length: 31 }, (_, i) => [cx - r * Math.cos(i * Math.PI / 30), bot + ry * Math.sin(i * Math.PI / 30)]), [[cx + r, top]]);
          shape(body, Object.assign({ shade: "lr", hatch: { angle: 90, spacing: 6, strength: 0.4, color: "hi" } }, p));
          shape(ell(cx, top, r, ry), { tone: p.topTone || "light", hatch: { angle: 0, spacing: 5, strength: 0.65, color: "hi", lit: false }, shade: "none" });
          rim([cx - r, top + 8], [cx - r, bot - 6]); return; }
        const cy = num(p.cy, 0), x0 = num(p.x0, 0), x1 = num(p.x1, 200), r = num(p.r, 60), rx = num(p.rx, r * 0.26);
        const body = [[x0, cy - r], [x1, cy - r], [x1, cy + r], [x0, cy + r]];
        shape(body, Object.assign({ shade: "tb", hatch: { angle: 0, spacing: 5, strength: 0.5, color: "hi" } }, p));
        const endX = p.end === "right" ? x1 : x0; shape(ell(endX, cy, rx, r), { tone: p.endTone || "deep", shade: "none", hatch: { strength: 0.2 } });
        rim([x0 + 4, cy - r + 4], [x1 - 4, cy - r + 4]); return;
      }
      if (t === "tube") {
        const [x1, y1] = pt(p.from), [x2, y2] = pt(p.to), w = num(p.width, 20); const L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L * w / 2, ny = (x2 - x1) / L * w / 2;
        shape([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], Object.assign({ shade: "none", lineWidth: 1.8, hatch: { angle: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 70, spacing: 6, strength: 0.3, lit: false } }, p));
        out.push(`<path d="${wobbly([x1 - nx * 0.5, y1 - ny * 0.5], [x2 - nx * 0.5, y2 - ny * 0.5], 1.3, 0)}" stroke="${HC}" stroke-width="2" opacity="${HL === "off" ? 0.6 : 0.8}" fill="none"/>`); return;
      }
      if (t === "line" || t === "cable") {
        const q = pts(p.points); if (q.length < 2) return; grow(tp(q)); const w = num(p.width, t === "cable" ? 16 : 3), d = p.smooth === false ? "M" + q.map((a) => f(a[0]) + " " + f(a[1])).join(" L") : smoothPath(q);
        const col = tone(p.tone, t === "cable" ? "deep" : "hi");
        out.push(`<path d="${d}" stroke="${col}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${num(p.opacity, 0.9)}"/>`);
        if (t === "cable") out.push(`<path d="${d}" stroke="${TONE.light}" stroke-width="3" fill="none" transform="translate(-3 -3)" opacity="0.7"/>`); return;
      }
      if (t === "ring" || t === "arc") { const q = ell(num(p.cx, 0), num(p.cy, 0), num(p.rx, 100), num(p.ry, 30), num(p.from, 0), num(p.to, 360)); grow(tp(q)); const d = "M" + q.map((a) => f(a[0]) + " " + f(a[1])).join(" L");
        out.push(`<path d="${d}" stroke="${tone(p.tone, "mid")}" stroke-width="${f(num(p.width, 16))}" fill="none" stroke-linecap="round"/>`);
        outline(q.map(([x, y]) => [x, y - num(p.width, 16) / 2]), HC, 2.2, false, 1, 0.8); return; }
      if (t === "scribble") { // chalk handwriting with no real letters
        const x0 = num(p.x0, 0), x1 = num(p.x1, 200), y = num(p.y, 0), size = num(p.size, 14); grow(tp([[x0, y - size], [x1, y + size]]));
        for (let x = x0; x < x1 - 20;) { const L = Math.min(U(40, 110), x1 - x), n = Math.floor(L / 5), q = [], fr = U(1.4, 2.2);
          for (let i = 0; i <= n; i++) q.push([x + L * i / Math.max(n, 1), y + Math.sin(i * fr) * size * 0.45 * U(0.6, 1.1)]);
          out.push(`<path d="M${q.map((a) => f(a[0]) + " " + f(a[1])).join(" L")}" stroke="${tone(p.tone, "hi")}" stroke-width="3" fill="none" opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>`); x += L + U(18, 30); }
        return; }
      if (t === "highlight") { const q = pts(p.points); for (let i = 0; i < q.length - 1; i++) rim(q[i], q[i + 1]); return; }
      if (t === "glint") { const [x, y] = pt(p.at); out.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(num(p.rx, 5))}" ry="${f(num(p.ry, 18))}" fill="${HC}" opacity="0.9"${glowAttr}/><ellipse cx="${f(x - 1)}" cy="${f(y - 1)}" rx="${f(num(p.rx, 5) * 0.45)}" ry="${f(num(p.ry, 18) * 0.6)}" fill="${TONE.white}" opacity="0.95"/>`); return; }
    }
    const parts = Array.isArray(spec.parts) ? spec.parts : [];
    const keyLight = !light && TONE.key;
    const body = []; const swap = out; parts.forEach(draw); const drawn = out.splice(0);
    // atmosphere: key light (navy), floor shadow and scribbles, light falling off to the lower right
    const x0 = isFinite(bb[0]) ? bb[0] : W * 0.2, y0 = isFinite(bb[1]) ? bb[1] : H * 0.2, x1 = isFinite(bb[2]) ? bb[2] : W * 0.8, y1 = isFinite(bb[3]) ? bb[3] : H * 0.8;
    const fy = num(spec.floorY, null), cxm = (x0 + x1) / 2, rx = Math.max(200, (x1 - x0) * 0.55);
    if (keyLight) { defs.push(`<radialGradient id="key" cx="${f(x0 + (x1 - x0) * 0.3)}" cy="${f(y0 + (y1 - y0) * 0.3)}" r="${f(Math.max(x1 - x0, y1 - y0) * 0.85)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${TONE.key}" stop-opacity="0.6"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient>`); body.push(`<rect width="${W}" height="${H}" fill="url(#key)"/>`); }
    if (fy !== null) {
      defs.push(`<radialGradient id="pool" cx="${f(cxm)}" cy="${f(fy)}" r="${f(rx)}" gradientTransform="translate(0 ${f(fy * 0.8)}) scale(1 0.2)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${TONE.pool}" stop-opacity="0.6"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient>`);
      body.push(`<rect width="${W}" height="${H}" fill="url(#pool)"/>`);
      for (let i = 0; i < 18; i++) { const y = fy - 10 + i * 8 + U(-3, 3), x = cxm + U(-rx * 0.8, rx * 0.5), L = U(120, 320) * (1 - i / 26);
        body.push(`<path d="${wobbly([x, y], [x + L, y + U(-3, 3)], 1.3, 0, 40)}" stroke="${TONE.light}" stroke-width="1.3" opacity="${(0.25 * (1 - i / 22)).toFixed(2)}" fill="none"/>`); }
    }
    body.push(...drawn);
    defs.push(`<linearGradient id="fall" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1 + 50)}" y2="${f(y1 + 50)}"><stop offset="0" stop-color="${BG}" stop-opacity="0"/><stop offset="0.5" stop-color="${BG}" stop-opacity="${light ? 0.04 : 0.13}"/><stop offset="1" stop-color="${BG}" stop-opacity="${light ? 0.28 : keyLight ? 0.6 : 0.12}"/></linearGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#fall)"/>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join("")}<filter id="smudge" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter><filter id="hlglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/><feComponentTransfer in="b" result="b2"><feFuncA type="linear" slope="1.5"/></feComponentTransfer><feMerge><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs><rect width="${W}" height="${H}" fill="${BG}"/><g filter="url(#rough)">${body.join("")}</g></svg>`;
    return { svg, width: W, height: H, bg: BG };
  }

  // Rasterise and add the chalk grain (breaks the strokes up, keeps the background clean)
  async function raster(built, canvas, seed = 3) {
    const blob = new Blob([built.svg], { type: "image/svg+xml" }); const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.decoding = "async"; img.src = url; await img.decode();
      canvas.width = built.width; canvas.height = built.height; const g = canvas.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, built.width, built.height);
      const id = g.getImageData(0, 0, built.width, built.height), d = id.data, w = built.width, h = built.height;
      const bg = hx(built.bg); const R = rng(seed);
      const n = new Float32Array(w * h); for (let i = 0; i < n.length; i++) n[i] = (R() + R() + R() - 1.5) * 1.4;
      const m = new Float32Array(w * h);
      // pencil tooth: noise smeared along the diagonal, like graphite dragged across paper
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let s2 = n[i] * 2, c = 2;
        for (let k = 1; k <= 3; k++) { if (x + k < w && y + k < h) { s2 += n[i + k * (w + 1)]; c++; } if (x - k >= 0 && y - k >= 0) { s2 += n[i - k * (w + 1)]; c++; } }
        m[i] = s2 / c * 1.6; }
      const white = built.bg === WHITE;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2]; const lum = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 600;
        const k = 1 + m[j] * 0.62 * Math.min(1, lum * 2.5);
        let r = bg[0] + dr * k, gg = bg[1] + dg * k, b = bg[2] + db * k;
        if (Math.abs(r - bg[0]) <= 3 && Math.abs(gg - bg[1]) <= 3 && Math.abs(b - bg[2]) <= 3) { r = bg[0]; gg = bg[1]; b = bg[2]; }   // a clean, flat background
        d[i] = r; d[i + 1] = gg; d[i + 2] = b;
      }
      g.putImageData(id, 0, 0);
    } finally { URL.revokeObjectURL(url); }
    return canvas;
  }
  root.Chalk = { build, raster, TONE, palette, SUBJECTS, setPalettes, defaults, swatch, overrides: () => JSON.parse(JSON.stringify(OVR)) };
})(typeof window !== "undefined" ? window : globalThis);
