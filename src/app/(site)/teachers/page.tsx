import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { getTeachers } from "@/lib/data";
import { siteText } from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teachers", description: "Meet the OH-SO ED teachers: experienced secondary subject specialists teaching live online lessons." };

export default async function Teachers() {
  const [ts, txt] = await Promise.all([getTeachers(), siteText()]);
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Our Teachers</h1><p>{txt.teachers_intro}</p></div></section>
    <section className="s-sec"><div className="wrap"><div className="cgrid tcgrid" style={{ ["--cols" as string]: Math.min(Math.max(ts.length, 1), 5) }}>{ts.map((t) =>
      // laid out like the course cards (update 231): name and photo roundel at the top, role, subjects, Read more
      <article className="course tcourse" key={t.slug} style={{ ["--c" as string]: "#5fe0e8" }}>
        <div className="top">
          <div><div className="lvl">{/principal/i.test(t.designation ?? "") ? "Principal" : "Teacher"}</div><h3>{t.name}</h3></div>
          <div className="roundel tph" aria-hidden="true">{t.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={t.photo} alt="" width={240} height={240} loading="lazy" />
            : <span>{t.name.split(" ").map((p) => p[0]).join("")}</span>}</div>
        </div>
        {t.designation && <p className="trole">{t.designation}</p>}
        {t.subjects?.length ? <ul className="tsubs">{t.subjects.map((x) => <li key={x}>{x}</li>)}</ul> : null}
        <div className="cbtns"><Link className="btn sm btn-brand cread" href={`/teachers/${t.slug}`}>Read more</Link></div>
      </article>)}</div>
      <p className="tjoin">Want to teach with us? <Link href="/jobs">See our current vacancies</Link>.</p></div></section>
  </>);
}
