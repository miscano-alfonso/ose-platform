// OH-SO EdTech website editor: shared by the server (rendering) and the browser (the editor). No database here.
// Every piece of text on a page is found by its original wording: key = page + a short hash of the text.

export type SecSize = "none" | "s" | "m" | "l" | "xl";
export type SecSet = { pt?: SecSize; pb?: SecSize; bg?: string; hidden?: boolean };
export type StyleSet = { accent?: string; title?: string; eyebrow?: string; font?: string; size?: number; space?: "compact" | "normal" | "roomy"; btn?: "pill" | "round" | "square"; card?: number };
/** One element inside a section (a heading, paragraph, picture, row of buttons…): its space above and below, and for a group, the gap between its items. */
export type BlkSize = "0" | "xs" | "s" | "m" | "l" | "xl" | "xxl";
export type BlkSet = { mt?: BlkSize; mb?: BlkSize; gap?: BlkSize };
/** order: a page's sections (key = page), or the items inside one element (key = that element's id, e.g. "home:0:1.2"). */
export type Cms = { text: Record<string, string>; sec: Record<string, SecSet>; order: Record<string, number[]>; blk: Record<string, BlkSet>; style: StyleSet; at?: string; by?: string };
export const EMPTY_CMS: Cms = { text: {}, sec: {}, order: {}, blk: {}, style: {} };
export const BSIZES: { id: BlkSize; label: string; css: string }[] = [
  { id: "0", label: "None", css: "0px" }, { id: "xs", label: "Extra small (8px)", css: "8px" }, { id: "s", label: "Small (16px)", css: "16px" }, { id: "m", label: "Medium (28px)", css: "28px" },
  { id: "l", label: "Large (44px)", css: "44px" }, { id: "xl", label: "Extra large (64px)", css: "64px" }, { id: "xxl", label: "Huge (96px)", css: "96px" },
];
/** Element ids: "page:section" for a section, then ":" and the path of child positions joined by dots. */
export const BLOCK_ID = /^[a-z-]{2,20}:\d{1,2}(:\d{1,3}(\.\d{1,3}){0,12})?$/;

export const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** djb2 over the tidied text, in base 36. */
export function keyOf(page: string, text: string): string {
  let h = 5381; const t = norm(text);
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${page}:${(h >>> 0).toString(36)}`;
}

export const SIZES: { id: SecSize; label: string; css: string }[] = [
  { id: "none", label: "None", css: "0px" }, { id: "s", label: "Small", css: "32px" }, { id: "m", label: "Medium", css: "clamp(40px,6vw,72px)" },
  { id: "l", label: "Large", css: "clamp(56px,8vw,104px)" }, { id: "xl", label: "Extra large", css: "clamp(80px,11vw,144px)" },
];
/** Section backgrounds: the site's own colours, or any colour picked. */
export const BACKGROUNDS: { id: string; label: string; css: string }[] = [
  { id: "paper", label: "Page", css: "var(--paper)" }, { id: "card", label: "Card grey", css: "var(--card)" }, { id: "deep", label: "Deep", css: "var(--deep)" },
  { id: "teal", label: "Blue tint", css: "var(--teal-soft)" }, { id: "sun", label: "Yellow tint", css: "var(--sun-soft)" },
];
export const FONTS = ["Jost", "Inter", "DM Sans", "Poppins", "Space Grotesk", "Fraunces"];
/** Light or dark text for a background colour (#rrggbb). */
export function lightBg(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return false;
  const n = parseInt(m[1], 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6;
}
