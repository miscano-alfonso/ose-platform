import type { StyleSet } from "@/lib/edt-cms-key";

/** Site styles from the editor (Site styles panel): colours, font, text size, spacing and roundness, as CSS over edtech.css. */
export function CmsStyles({ s }: { s: StyleSet }) {
  const r: string[] = [], v: string[] = [];
  if (s.accent) { v.push(`--teal:${s.accent};--teal-d:${s.accent}`); r.push(`.edt .edt-btn{color:${ink(s.accent)}}.edt .edt-btn:hover{color:${ink(s.accent)};filter:brightness(1.1)}`); }
  if (s.font) v.push(`font-family:"${s.font}",system-ui,sans-serif`);
  if (s.size) v.push(`font-size:${s.size}px`);
  if (v.length) r.push(`.edt{${v.join(";")}}`);
  if (s.font) r.push(`.edt .edt-btn,.edt h1,.edt h2,.edt h3{font-family:"${s.font}",system-ui,sans-serif}`);
  if (s.title) r.push(`.edt .edt-h1:not(:has(.edt-hl)){color:${s.title}}`);
  if (s.eyebrow) r.push(`.edt .edt-eyebrow,.edt .edt-eyebrow:has(+ .edt-h1){color:${s.eyebrow}}`);
  if (s.space === "compact") r.push(`.edt .edt-sec{padding-block:clamp(36px,5vw,64px)}.edt .edt-sec.tight{padding-block:clamp(28px,4vw,48px)}`);
  if (s.space === "roomy") r.push(`.edt .edt-sec{padding-block:clamp(72px,10vw,136px)}.edt .edt-sec.tight{padding-block:clamp(52px,7vw,96px)}`);
  if (s.btn) r.push(`.edt .edt-btn,.edt .edt-bill,.edt .edt-bill button{border-radius:${s.btn === "round" ? "12px" : "4px"}}`);
  if (s.card != null) r.push(`.edt .edt-card,.edt .edt-plan,.edt .edt-form,.edt .edt-pick a,.edt .edt-faq details{border-radius:${s.card}px}`);
  if (!r.length) return null;
  const font = s.font && s.font !== "Jost" ? <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.font)}:wght@400;500;600;700&display=swap`} /> : null;
  return <>{font}<style dangerouslySetInnerHTML={{ __html: r.join("\n") }} /></>;
}
const ink = (hex: string) => { const n = parseInt(hex.slice(1), 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#08191e" : "#ffffff"; };
