import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getPriceRows, getBundles } from "@/lib/data";
import { KS3Bundles } from "../KS3Bundles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prices", description: "OH-SO ED course prices: KS3, pre-GCSE, iGCSE and A-Level, with bundle discounts for 3 or 5 KS3 courses." };

export default async function Pricing() {
  const [rows, { ks3Pence, bundles }] = await Promise.all([getPriceRows(), getBundles()]);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Our Pricing Plan</h1><p>Every course is priced per lesson. Payments are taken termly, two weeks before each term starts.</p></div></section>
    <section className="s-sec"><div className="wrap">
      <div className="ptab-wrap"><table className="ptab">
        <thead><tr><th scope="col">Level</th><th scope="col">Course length</th><th scope="col">Lessons</th><th scope="col">Cost per lesson</th><th scope="col">Total</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.level + r.years + r.per}>
          <td><b>{r.level}</b></td><td>{r.years} year{r.years > 1 ? "s" : ""}</td><td>{r.lessons}</td><td>{r.per}</td><td><b>{r.total}</b></td></tr>)}</tbody>
      </table></div>
      <div className="more" style={{ margin: "18px 0" }}><Link className="btn btn-brand" href="/calculator">Price calculator</Link></div>
      <p className="ttnote"><Link href="/faq#can-we-cancel">Cancellation policy</Link> · <Link href="/term-dates">When payments are taken</Link></p>
    </div></section>
    <KS3Bundles ks3Pence={ks3Pence} bundles={bundles}>
      <div className="more"><Link className="btn btn-accent" href="/courses">See all courses</Link></div>
    </KS3Bundles>
  </>);
}
