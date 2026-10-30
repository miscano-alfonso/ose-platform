import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { notFound } from "next/navigation";
import { getTeacher, getTeachers } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getTeacher((await params).slug);
  return t ? { title: `${t.name} – ${t.designation ?? "Teacher"}`, description: t.bio?.split("\n")[0].slice(0, 160) } : { title: "Teacher" };
}

export default async function TeacherProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, all] = await Promise.all([getTeacher(slug), getTeachers()]);
  if (!t) notFound();
  const first = t.name.split(" ")[0];
  const paras = (t.bio ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (<>
    <section className="s-phead"><div className="wrap"><p className="eyebrow"><Link href="/teachers">← Our teachers</Link></p><h1>{t.name}</h1><p>{t.designation}</p></div></section>
    <section className="s-sec"><div className="wrap tprofile tp3">
      <div className="tp-left">
        {t.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="tp-photo" src={t.photo} alt={`Photo of ${t.name}`} width={640} height={800} />
          : <div className="tav tp-photo" aria-hidden="true">{t.name.split(" ").map((p) => p[0]).join("")}</div>}
      </div>
      <div className="tp-body">
        {paras.length ? paras.map((p, i) => <p key={i} className={i === 0 ? "tp-lead" : undefined}>{p}</p>) : <p className="muted">More about {first} soon.</p>}
      </div>
      {t.qualifications.length > 0 && <aside className="tp-side"><div className="tp-tile"><h2>Qualifications</h2><ul className="tp-quals">{t.qualifications.map((q) => <li key={q}>{q}</li>)}</ul></div></aside>}
    </div></section>
    <section className="s-sec tp-others"><div className="wrap"><h2>Our Teachers</h2><div className="tp-strip">{all.filter((o) => o.slug !== t.slug).map((o) =>
      <Link key={o.slug} href={`/teachers/${o.slug}`} className="tp-mini">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {o.photo ? <img src={o.photo} alt="" width={120} height={120} loading="lazy" /> : <span className="tav">{o.name[0]}</span>}
        <b>{o.name}</b><span>{o.designation}</span></Link>)}</div></div></section>
  </>);
}
