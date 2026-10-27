import Link from "next/link";

/** A screenshot in a simple browser frame. The pictures are of the made-up Demo Academy (no real families). */
export function Shot({ src, alt, url, className = "" }: { src: string; alt: string; url: string; className?: string }) {
  return <figure className={`edt-shot ${className}`} style={{ margin: 0 }}>
    <div className="bar" aria-hidden="true"><i /><i /><i /><span>{url}</span></div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} loading="lazy" width={1400} height={900} />
  </figure>;
}

const P: Record<string, string> = {
  site: "M3 5h18v14H3zM3 9h18M7 7h.01",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  cal: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  meet: "M3 7h12v10H3zM15 11l6-4v10l-6-4",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-4-5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  report: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  pound: "M16 6a4 4 0 0 0-7 2v4H6M6 12h8M9 12v3c0 2-1 4-3 5h12",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  brush: "M14 4l6 6-8 8H6v-6zM4 20h4",
};
export function Ico({ n }: { n: keyof typeof P }) {
  return <span className="edt-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={P[n]} /></svg></span>;
}

export function TrialCta({ dark }: { dark?: boolean }) {
  return <div className="edt-btns"><Link href="/osedtech/trial" className={`edt-btn${dark ? " teal" : ""}`}>Start a free trial</Link>
    <Link href="/osedtech/demo" className="edt-btn line">Look round the demo</Link></div>;
}
