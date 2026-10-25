import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Basket", robots: { index: false, follow: false } };

// The basket fills once online booking is switched on.
export default function Cart() {
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Your Basket</h1></div></section>
    <section className="s-sec"><div className="wrap">
      <div className="notice"><h2>Your basket is empty</h2><p>Choose a course and its group, then add it here to book. Bundle discounts are applied automatically when you add 3 or 5 KS3 courses.</p>
        <div className="btns"><Link className="btn btn-brand" href="/courses">Browse courses</Link><Link className="btn btn-line" href="/other-services">Workshops</Link></div></div>
    </div></section>
  </>);
}
