// Site-wide sizes and spacing the office can change in Admin → Page styles.
// Shared by the server (writes the saved CSS into every page) and the builder (live preview).
// A value that isn't set keeps the size from the stylesheet.

export type Device = "desktop" | "phone";
export type StyleValues = Partial<Record<string, number>>;
export type SiteStyles = { desktop: StyleValues; phone: StyleValues };
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
  const out: SiteStyles = { desktop: {}, phone: {} };
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const d of ["desktop", "phone"] as Device[]) {
    const vals = (r[d] && typeof r[d] === "object" ? r[d] : {}) as Record<string, unknown>;
    for (const [id, v] of Object.entries(vals)) {
      const t = BY_ID.get(id); const n = typeof v === "number" ? v : Number(v);
      if (t && v !== null && v !== "" && Number.isFinite(n)) out[d][id] = Math.min(t.max, Math.max(t.min, Math.round(n * 100) / 100));
    }
  }
  return out;
}

/** CSS for the saved values. `:root` in front makes each rule win over the stylesheet's own. */
export function stylesCss(s: SiteStyles): string {
  let css = "";
  for (const d of ["desktop", "phone"] as Device[]) {
    const rules = STYLE_TOKENS.filter((t) => s[d]?.[t.id] != null).map((t) =>
      `${t.sel.split(",").map((x) => `:root ${x.trim()}`).join(",")}{${t.prop}:${s[d][t.id]}${t.unit}}`);
    if (rules.length) css += `@media ${MEDIA[d]}{${rules.join("")}}`;
  }
  return css;
}
