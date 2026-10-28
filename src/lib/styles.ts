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
export const FONT_SCOPES: { id: string; label: string; hint: string; sel: string; familySel?: string }[] = [
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

// ---- Dashboards (admin and teacher now; parent and student areas use the same styles when they're built) ----
export const DASH_FONT_SCOPES: typeof FONT_SCOPES = [
  // the dashboard stylesheet names Jost on many items, so the font goes on everything; the weight only on the base text
  { id: "site", label: "Dashboard font", hint: "All text in the dashboards, unless set below", sel: ".adm", familySel: ".adm, .adm *" },
  { id: "headings", label: "Headings font", hint: "Page titles and box headings", sel: ".adm h1, .adm h2, .adm h3, .adm .tile .v" },
];
export const DASH_TOKENS: StyleToken[] = [
  { id: "d_h1", group: "Headings", label: "Page titles", hint: "e.g. Families, Payments", sel: ".adm .top h1", prop: "font-size", min: 18, max: 48, step: 1, unit: "px" },
  { id: "d_h2", group: "Headings", label: "Box headings", sel: ".adm .card h2, .adm .h2", prop: "font-size", min: 14, max: 34, step: 0.5, unit: "px" },
  { id: "d_tile", group: "Headings", label: "Dashboard numbers", hint: "The big figures in the tiles", sel: ".adm .tile .v", prop: "--tv", min: 18, max: 56, step: 1, unit: "px" },
  { id: "d_body", group: "Text", label: "Main text", sel: ".adm", prop: "font-size", min: 12, max: 22, step: 0.5, unit: "px" },
  { id: "d_line", group: "Text", label: "Line spacing", sel: ".adm", prop: "line-height", min: 1.1, max: 2, step: 0.05, unit: "" },
  { id: "d_td", group: "Text", label: "Table text", sel: ".adm td", prop: "font-size", min: 11, max: 22, step: 0.5, unit: "px" },
  { id: "d_th", group: "Text", label: "Table column titles", sel: ".adm th", prop: "font-size", min: 10, max: 20, step: 0.5, unit: "px" },
  { id: "d_label", group: "Text", label: "Form labels", sel: ".adm .fld", prop: "font-size", min: 11, max: 20, step: 0.5, unit: "px" },
  { id: "d_muted", group: "Text", label: "Notes and grey text", sel: ".adm .muted, .adm .note, .adm .top .sub, .adm .card .cs", prop: "font-size", min: 11, max: 20, step: 0.5, unit: "px" },
  { id: "d_nav", group: "Navigation & buttons", label: "Side menu links", sel: ".adm .nav a, .adm .nav span", prop: "font-size", min: 12, max: 24, step: 0.5, unit: "px" },
  { id: "d_nav_gap", group: "Navigation & buttons", label: "Space between menu links", sel: ".adm .nav a", prop: "padding-block", min: 0, max: 18, step: 1, unit: "px" },
  { id: "d_side", group: "Navigation & buttons", label: "Side menu width", sel: ".adm .app", prop: "--side-w", min: 180, max: 340, step: 2, unit: "px" },
  { id: "d_btn", group: "Navigation & buttons", label: "Button text", sel: ".adm .abtn", prop: "font-size", min: 11, max: 22, step: 0.5, unit: "px" },
  { id: "d_card_pad", group: "Spacing", label: "Padding inside boxes", sel: ".adm .card, .adm .tile", prop: "padding", min: 6, max: 40, step: 1, unit: "px" },
  { id: "d_card_gap", group: "Spacing", label: "Space between boxes", sel: ".adm .card, .adm .tw", prop: "margin-bottom", min: 0, max: 48, step: 1, unit: "px" },
  { id: "d_row", group: "Spacing", label: "Table row height", hint: "Space above and below each row's text", sel: ".adm td", prop: "padding-block", min: 2, max: 24, step: 1, unit: "px" },
  { id: "d_main", group: "Spacing", label: "Page margins", sel: ".adm .main", prop: "padding-inline", min: 8, max: 72, step: 1, unit: "px" },
];

export type StyleKind = "site" | "dash";
const SCHEMES: Record<StyleKind, { tokens: StyleToken[]; scopes: typeof FONT_SCOPES }> = {
  site: { tokens: STYLE_TOKENS, scopes: FONT_SCOPES },
  dash: { tokens: DASH_TOKENS, scopes: DASH_FONT_SCOPES },
};
export const scheme = (k: StyleKind) => SCHEMES[k];
export const MEDIA: Record<Device, string> = { desktop: "(min-width:821px)", phone: "(max-width:820px)" };

/** Keep only known tokens with numbers inside their range. */
export function cleanStyles(raw: unknown, kind: StyleKind = "site"): SiteStyles {
  const { tokens, scopes } = SCHEMES[kind]; const BY_ID = new Map(tokens.map((t) => [t.id, t]));
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
  const ids = new Set([...scopes.map((f) => f.id), ...tokens.filter((t) => t.prop === "font-size").map((t) => t.id)]);
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
export function stylesCss(s: SiteStyles, kind: StyleKind = "site"): string {
  const { tokens, scopes } = SCHEMES[kind];
  let css = "";
  const pre = (sel: string) => sel.split(",").map((x) => `:root ${x.trim()}`).join(",");
  // dashboards: the stylesheet sets fonts with high-priority rules, so chosen fonts are marked important (more specific choices still win)
  const imp = kind === "dash" ? " !important" : "";
  const decl = (f: FontChoice) => (f.family ? `font-family:"${f.family}",${FONT_BY_NAME.get(f.family)?.fallback ?? "sans-serif"}${imp};` : "") + (f.weight ? `font-weight:${f.weight}${imp};` : "");
  for (const sc of scopes) {
    const f = s.fonts?.[sc.id]; if (!f || !(f.family || f.weight)) continue;
    if (sc.familySel && f.family) { css += `${pre(sc.familySel)}{${decl({ family: f.family })}}`; if (f.weight) css += `${pre(sc.sel)}{${decl({ weight: f.weight })}}`; }
    else css += `${pre(sc.sel)}{${decl(f)}}`;
  }
  for (const t of tokens) { const f = s.fonts?.[t.id]; if (f && (f.family || f.weight)) css += `${pre(t.sel)}{${decl(f)}}`; }
  for (const d of ["desktop", "phone"] as Device[]) {
    const rules = tokens.filter((t) => s[d]?.[t.id] != null).map((t) =>
      `${t.sel.split(",").map((x) => `:root ${x.trim()}`).join(",")}{${t.prop}:${s[d][t.id]}${t.unit}}`);
    if (rules.length) css += `@media ${MEDIA[d]}{${rules.join("")}}`;
  }
  return css;
}
