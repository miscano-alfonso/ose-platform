// The demo school's website theme (Demo Academy). The real school's look comes from Admin → Page styles;
// the demo has none, so this sets a complete, consistent palette: a light header, deep teal and coral.
export function demoCss(p: string, a: string): string {
  const line = "#dfe9eb", tint = "#e8f3f1";
  return `:root{--navy:${p};--brand:${p};--ink:${p};--mustard:${a};--accent:${a};--on-brand:#fff;--muted:#4c6168;--mist:#f2f7f6;--line:${line};--soft:${tint}}
html{background:${p}}
.s-nav{background:#fff;color:${p};border-bottom:1px solid ${line}}
.s-links a:hover,.s-links a[aria-current=page]{border-bottom-color:${a}}
.s-ico{background:${a};border-color:${a};color:${p}}
.s-ico:hover,.s-ico:focus-visible{background:${p};border-color:${p};color:#fff}
.s-burger{border-color:${p};color:${p}}
.s-burger:hover,.s-burger[aria-expanded=true]{background:${p};color:#fff}
@media (max-width:1080px){.s-nav .s-links a{border-bottom-color:${line}}.s-nav .s-links a:hover,.s-nav .s-links a[aria-current=page]{color:${p};border-bottom-color:${a}}}
.ticker{background:${tint};color:${p}}
.space-card{background:#fff linear-gradient(135deg,transparent 78%,${tint} 78%)}
.space-dots button{background:${line}}
.yrtabs a,.calc .yrtabs button{border-color:${line}}
.ptab td{border-top-color:${line}}
.cform input,.cform select,.cform textarea{border-color:#cfdcdf}
.hub-sec.alt,.rev-bar{background:#f2f7f6}
.job-facts li{background:${tint}}
.job-req{background:#fff4ef;border-color:#ffcbb8}
.sl-few{background:#ffe1d6;color:#7a2e14}.sl-soon{background:${tint};color:${p}}`;
}
