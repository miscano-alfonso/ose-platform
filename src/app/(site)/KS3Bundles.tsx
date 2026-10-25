import { money } from "@/lib/format";
import type { Bundle } from "@/lib/data";

/** "Cost For a Typical KS3 Year": one course, then each bundle discount, with the saving shown. */
export function KS3Bundles({ ks3Pence, bundles, children }: { ks3Pence: number; bundles: Bundle[]; children?: React.ReactNode }) {
  if (!ks3Pence) return null;
  const cols = [{ name: "Single Course", n: 1, pc: 0 }, ...bundles.map((b) => ({ name: `${b.min_courses} Courses Bundle`, n: b.min_courses, pc: Number(b.percent_off) }))];
  return <section className="s-sec s-price"><div className="wrap">
    <div className="sec-head"><h2>Cost For a Typical KS3 Year</h2></div>
    <div className="pgrid">{cols.map((b) => {
      const each = ks3Pence * (1 - b.pc / 100);
      return <div className="bundle" key={b.name}><h3>{b.name}</h3>{b.pc > 0 && <span className="burst">{b.pc}%<br />Discount</span>}
        {Array.from({ length: b.n }, (_, i) => <div className="ln" key={i}>{b.pc > 0 && <s>{money(ks3Pence)}</s>}<span>{money(each)}</span></div>)}
        {b.n > 1 && <div className="tot">{b.pc > 0 && <s>{money(ks3Pence * b.n)}</s>}<span>{money(each * b.n)}</span></div>}</div>;
    })}</div>
    {children}
  </div></section>;
}
