// Site-wide sizes and spacing the office can change in Admin → Page styles.
// Shared by the server (writes the saved CSS into every page) and the builder (live preview).
// A value that isn't set keeps the size from the stylesheet.

export type Device = "desktop" | "phone";
export type StyleValues = Partial<Record<string, number>>;
export type FontChoice = { family?: string; weight?: number };
/** fonts apply on every screen size; keys are "site", "headings" or a text token id */
export type SiteStyles = { desktop: StyleValues; phone: StyleValues; fonts?: Record<string, FontChoice> };

// Google Fonts the office can pick, with the weights each one has.
export const FONTS: { name: string; fallback: string; weights: number[] }[] = [
  { name: "Jost", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Inter", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Poppins", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Montserrat", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Nunito", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Quicksand", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "DM Sans", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Work Sans", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Raleway", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Open Sans", fallback: "sans-serif", weights: [300, 400, 500, 600, 700] },
  { name: "Lato", fallback: "sans-serif", weights: [300, 400, 700] },
  { name: "Roboto", fallback: "sans-serif", weights: [300, 400, 500, 700] },
  { name: "Playfair Display", fallback: "serif", weights: [400, 500, 600, 700] },
  { name: "Lora", fallback: "serif", weights: [400, 500, 600, 700] },
  { name: "Merriweather", fallback: "serif", weights: [300, 400, 700] },
];
export const WEIGHTS: [number, string][] = [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semi-bold"], [700, "Bold"]];
/** Font settings that cover many things at once (shown in the Fonts group). */
export const FONT_SCOPES: { id: string; label: string; hint: string; sel: string }[] = [
  { id: "site", label: "Website font", hint: "All text on the website, unless set below", sel: "body, button, input, select, textarea" },
  { id: "headings", label: "Headings font", hint: "Every main heading and section heading", sel: "h1, h2, h3" },
];
const FONT_BY_NAME = new Map(FONTS.map((f) => [f.name, f]));

/** Stylesheet link for the chosen Google Fonts (Jost is always loaded by the site). */
export function fontsHref(s: SiteStyles): string | null {
  const used = [...new Set(Object.values(s.fonts ?? {}).map((f) => f.family).filter((f): f is string => !!f && f !== "Jost" && FONT_BY_NAME.has(f)))].sort();
  if (!used.length) return null;
  return "https://fonts.googleapis.com/css2?" + used.map((n) => `family=${n.replace(/ /g, "+")}:wght@${FONT_BY_NAME.get(n)!.weights.join(";")}`).join("&") + "&display=swap";
}
export type StyleToken = { id: string; group: string; label: string; hint?: string; sel: string; prop: string; min: number; max: number; step: number; unit: "px" | "" };

export const STYLE_GROUPS = ["Headings", "Text", "Navigation & buttons", "Spacing"] as const;

export const STYLE_TOKENS: StyleToken[] = [
  { id: "hero_h1", group: "Headings", label: "Homepage main heading", sel: ".s-hero h1", prop: "font-size", min: 24, max: 110, step: 1, unit: "px" },
  { id: "page_h1", group: "Headings", label: "Page headings (top banner)", hint: "Courses, Prices, Term dates and the other pages", sel: ".s-phead h1", prop: "font-size", min: 24, max: 96, step: 1, unit: "px" },
  { id: "sec_h2", group: "Headings", label: "Section headings", hint: "e.g. Space Available, KS3 bundles", sel: ".sec-head h2, .space-h, .cd-h, .tyh", prop: "font-size", min: 18, max: 90, step: 1, unit: "px" },
  { id: "card_h3", group: "Headings", label: "Card titles", hint: "Course, bundle, teacher and service cards", sel: ".course h3, .bundle h3, .svc h3, .tcard h2, .cd-card h3, .cd-topic h3, .space-lvl, .calc-sum h2", prop: "font-size", min: 14, max: 44, step: 1, unit: "px" },
  { id: "eyebrow", group: "Headings", label: "Small headings above titles", hint: "The yellow capitals", sel: ".eyebrow", prop: "font-size", min: 9, max: 22, step: 0.5, unit: "px" },

  { id: "body", group: "Text", label: "Body text", sel: "body, .tp-body p, .cd-topic p, .cd-topic li, .faq .ans", prop: "font-size", min: 12, max: 24, step: 0.5, unit: "px" },
  { id: "line_height", group: "Text", label: "Line spacing", sel: "body, .tp-body p, .cd-topic p, .cd-topic li", prop: "line-height", min: 1.1, max: 2.2, step: 0.05, unit: "" },
  { id: "lead", group: "Text", label: "Intro text", hint: "The paragraph under main headings", sel: ".s-hero .lead, .s-phead p, .sec-head p, .calc-intro", prop: "font-size", min: 13, max: 32, step: 0.5, unit: "px" },
  { id: "prices", group: "Text", label: "Prices", sel: ".course .price, .bundle .tot, .svc-buy .price, .calc-total", prop: "font-size", min: 14, max: 60, step: 1, unit: "px" },
  { id: "ticker", group: "Text", label: "Yellow ticker", sel: ".ticker-track span", prop: "font-size", min: 12, max: 56, step: 1, unit: "px" },
  { id: "faq_q", group: "Text", label: "FAQ questions", sel: ".faq summary", prop: "font-size", min: 13, max: 30, step: 0.5, unit: "px" },
  { id: "footer", group: "Text", label: "Footer text", sel: ".s-foot", prop: "font-size", min: 11, max: 22, step: 0.5, unit: "px" },

  { id: "nav", group: "Navigation & buttons", label: "Menu links", sel: ".s-nav .s-links", prop: "font-size", min: 10, max: 24, step: 0.5, unit: "px" },
  { id: "nav_gap", group: "Navigation & buttons", label: "Space between menu links", hint: "On phones the menu is a list, so this only changes the desktop menu", sel: ".s-nav .s-links", prop: "column-gap", min: 4, max: 60, step: 1, unit: "px" },
  { id: "btn", group: "Navigation & buttons", label: "Button text", sel: ".btn", prop: "font-size", min: 10, max: 24, step: 0.5, unit: "px" },
  { id: "btn_pad", group: "Navigation & buttons", label: "Button height", hint: "Space above and below the button text", sel: ".btn", prop: "padding-block", min: 4, max: 28, step: 1, unit: "px" },

  { id: "sec_pad", group: "Spacing", label: "Space above and below sections", sel: ".s-sec", prop: "padding-block", min: 8, max: 180, step: 2, unit: "px" },
  { id: "banner_pad", group: "Spacing", label: "Top banner height", hint: "Space above and below page headings", sel: ".s-phead", prop: "padding-block", min: 8, max: 160, step: 2, unit: "px" },
  { id: "head_gap", group: "Spacing", label: "Space under section headings", sel: ".sec-head", prop: "margin-bottom", min: 0, max: 96, step: 2, unit: "px" },
  { id: "card_gap", group: "Spacing", label: "Space between cards", sel: ".cgrid, .pgrid, .tgrid, .terms, .faq, .tp-strip", prop: "gap", min: 0, max: 64, step: 1, unit: "px" },
  { id: "card_pad", group: "Spacing", label: "Padding inside cards", sel: ".course, .tcard, .svc, .space-card", prop: "padding", min: 6, max: 56, step: 1, unit: "px" },
  { id: "ticker_pad", group: "Spacing", label: "Ticker height", sel: ".ticker", prop: "padding-block", min: 2, max: 56, step: 1, unit: "px" },
  { id: "side", group: "Spacing", label: "Page side margins", sel: ".wrap", prop: "padding-inline", min: 8, max: 96, step: 1, unit: "px" },
];

const BY_ID = new Map(STYLE_TOKENS.map((t) => [t.id, t]));
export const MEDIA: Record<Device, string> = { desktop: "(min-width:821px)", phone: "(max-width:820px)" };

/** Keep only known tokens with numbers inside their range. */
export function cleanStyles(raw: unknown): SiteStyles {
  const out: SiteStyles = { desktop: {}, phone: {}, fonts: {} };
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const d of ["desktop", "phone"] as Device[]) {
    const vals = (r[d] && typeof r[d] === "object" ? r[d] : {}) as Record<string, unknown>;
    for (const [id, v] of Object.entries(vals)) {
      const t = BY_ID.get(id); const n = typeof v === "number" ? v : Number(v);
      if (t && v !== null && v !== "" && Number.isFinite(n)) out[d][id] = Math.min(t.max, Math.max(t.min, Math.round(n * 100) / 100));
    }
  }
  const fonts = (r.fonts && typeof r.fonts === "object" ? r.fonts : {}) as Record<string, unknown>;
  const ids = new Set([...FONT_SCOPES.map((f) => f.id), ...STYLE_TOKENS.filter((t) => t.prop === "font-size").map((t) => t.id)]);
  for (const [id, v] of Object.entries(fonts)) {
    if (!ids.has(id) || !v || typeof v !== "object") continue;
    const { family, weight } = v as Record<string, unknown>;
    const c: FontChoice = {};
    if (typeof family === "string" && FONT_BY_NAME.has(family)) c.family = family;
    if (WEIGHTS.some(([w]) => w === Number(weight))) c.weight = Number(weight);
    if (c.family || c.weight) out.fonts![id] = c;
  }
  if (!Object.keys(out.fonts!).length) delete out.fonts;
  return out;
}

/** True when nothing has been changed from the stylesheet. */
export const isEmptyStyles = (s: SiteStyles) => !Object.keys(s.desktop).length && !Object.keys(s.phone).length && !Object.keys(s.fonts ?? {}).length;

/** CSS for the saved values. `:root` in front makes each rule win over the stylesheet's own. */
export function stylesCss(s: SiteStyles): string {
  let css = "";
  const pre = (sel: string) => sel.split(",").map((x) => `:root ${x.trim()}`).join(",");
  const decl = (f: FontChoice) => (f.family ? `font-family:"${f.family}",${FONT_BY_NAME.get(f.family)?.fallback ?? "sans-serif"};` : "") + (f.weight ? `font-weight:${f.weight};` : "");
  for (const sc of FONT_SCOPES) { const f = s.fonts?.[sc.id]; if (f && (f.family || f.weight)) css += `${pre(sc.sel)}{${decl(f)}}`; }
  for (const t of STYLE_TOKENS) { const f = s.fonts?.[t.id]; if (f && (f.family || f.weight)) css += `${pre(t.sel)}{${decl(f)}}`; }
  for (const d of ["desktop", "phone"] as Device[]) {
    const rules = STYLE_TOKENS.filter((t) => s[d]?.[t.id] != null).map((t) =>
      `${t.sel.split(",").map((x) => `:root ${x.trim()}`).join(",")}{${t.prop}:${s[d][t.id]}${t.unit}}`);
    if (rules.length) css += `@media ${MEDIA[d]}{${rules.join("")}}`;
  }
  return css;
}
