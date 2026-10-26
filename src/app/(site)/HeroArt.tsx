// The hero illustration from ohsoed.co.uk: the banner with eight icons that drop or rise in, then wobble ("tada") on a loop.
// Positions are percentages of the 496×444 box used on the old site.
const ICONS: [string, number, number, number, "up" | "down", number][] = [
  ["pencil-a-icons1", 6.05, 18.69, 14.31, "down", 0.8],
  ["bag-icons", 1.81, 28.60, 17.94, "up", 1],
  ["pencil-c-icons1", 3.83, 66.44, 19.56, "up", 0.8],
  ["pencil-b-icons2", 10.48, 75.90, 17.34, "down", 1],
  ["pencil-a-icons2", 74.40, 69.82, 15.32, "up", 0.8],
  ["bulb-icons1", 77.62, 32.66, 16.53, "down", 1],
  ["pencil-b-icons1", 78.02, 21.62, 14.52, "up", 1],
  ["bulb-icons1", 62.50, 1.13, 16.53, "down", 0.8],
];

export function HeroArt({ children }: { children?: React.ReactNode }) {
  return (
    <div className="hero-art" aria-hidden={children ? undefined : true}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hero-banner" src="/hero/banner.webp" alt="" width={880} height={863} fetchPriority="high" />
      {ICONS.map(([n, x, y, w, dir, delay], i) => (
        <span key={i} className={`hero-ic in-${dir}`} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, animationDelay: `${delay}s` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/hero/${n}.webp`} alt="" width={180} height={180} style={{ animationDelay: `${(i % 4) * 0.35}s` }} />
        </span>
      ))}
      {children}
    </div>
  );
}

export function Ticker({ items }: { items: string[] }) {
  // Each half of the loop must be wider than the widest screen, or a gap shows: repeat short lists.
  const chars = items.join("").length + items.length * 6;
  const reps = Math.max(1, Math.ceil(260 / Math.max(chars, 1)));
  const list = Array.from({ length: reps }, () => items).flat();
  const run = list.map((t, i) => <span key={i}><b aria-hidden="true">✦✦✦</b>{t}</span>);
  return (
    <section className="ticker" aria-label={items.join(". ")}>
      <div className="ticker-track" aria-hidden="true" style={{ animationDuration: `${Math.round((list.join("").length + list.length * 6) * 0.28)}s` }}><div>{run}</div><div>{run}</div></div>
    </section>
  );
}
