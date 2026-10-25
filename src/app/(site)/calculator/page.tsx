import type { Metadata } from "next";
import Link from "next/link";
import { getCalculator } from "@/lib/data";
import { Calculator } from "./Calculator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Price calculator", description: "Work out the cost of OH-SO ED courses, including the discount for 3 or more courses and the termly payments." };

export default async function CalculatorPage() {
  const years = await getCalculator();
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Calculator</h1><p>Choose a level for each subject to see the total cost, any bundle discount and your termly payments.</p></div></section>
    <section className="s-sec"><div className="wrap">
      {years.length === 0 ? <p>Prices for the next school year will be available soon. <Link href="/contact">Get in touch</Link> for details.</p> : <Calculator years={years} />}
    </div></section>
  </>);
}
