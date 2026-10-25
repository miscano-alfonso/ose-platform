import type { Metadata } from "next";
import Link from "next/link";
import { getTeachers } from "@/lib/data";
import { siteText } from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teachers", description: "Meet the OH-SO ED teachers: experienced secondary subject specialists teaching live online lessons." };

export default async function Teachers() {
  const [ts, txt] = await Promise.all([getTeachers(), siteText()]);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Our Teachers</h1><p>{txt.teachers_intro}</p></div></section>
    <section className="s-sec"><div className="wrap"><div className="tgrid">{ts.map((t) =>
      <Link className="tcard tlink" key={t.slug} href={`/teachers/${t.slug}`}>
        {t.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="tphoto" src={t.photo} alt="" width={640} height={480} loading="lazy" />
          : <div className="tav" aria-hidden="true">{t.name.split(" ").map((p) => p[0]).join("")}</div>}
        <h2>{t.name}</h2><p className="role">{t.designation}</p>{t.subjects?.length ? <p className="subs">{t.subjects.join(" · ")}</p> : null}
        <span className="tmore">Read more →</span></Link>)}</div></div></section>
  </>);
}
