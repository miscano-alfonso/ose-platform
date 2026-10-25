import { getStyles } from "@/lib/site-content";
import { StyleBuilder } from "./StyleBuilder";

export default async function PageStyles({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams;
  const saved = await getStyles();
  return <>
    <div className="top"><div><h1>Page styles</h1><div className="sub">Text sizes and spacing for the whole website. Drag a slider to see it on the right, then save to publish.</div></div><span className="grow" /><a className="abtn sm" href="/" target="_blank" rel="noreferrer">View the website</a></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <StyleBuilder saved={saved} />
  </>;
}
