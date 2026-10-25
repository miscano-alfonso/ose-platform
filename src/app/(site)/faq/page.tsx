import type { Metadata } from "next";
import Link from "next/link";
import { FAQS } from "@/content/faq";

export const metadata: Metadata = { title: "FAQs", description: "Answers to the questions parents ask most: courses, subjects, joining mid-term, cancelling, lessons, class sizes, teachers, exams and SEND." };

const slug = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Lines starting "- " become a bullet list; other lines are paragraphs. */
function Answer({ text }: { text: string }) {
  const out: React.ReactNode[] = []; let list: string[] = [];
  const flush = () => { if (list.length) out.push(<ul key={out.length}>{list.map((l) => <li key={l}>{l}</li>)}</ul>); list = []; };
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) list.push(line.slice(2));
    else { flush(); if (line.trim()) out.push(<p key={out.length}>{line}</p>); }
  }
  flush();
  return <>{out}</>;
}

export default function Faq() {
  return (<>
    <section className="s-phead"><div className="wrap"><h1>FAQs</h1><p>If your question isn’t answered here, please <Link href="/contact">get in touch</Link>.</p></div></section>
    <section className="s-sec"><div className="wrap faq">
      {FAQS.map((f) => <details key={f.q} id={slug(f.q)}><summary>{f.q}</summary><div className="ans"><Answer text={f.a} /></div></details>)}
    </div></section>
  </>);
}
