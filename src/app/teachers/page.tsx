import type { Metadata } from "next";
import { getTeachers } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teachers", description: "Meet the OH-SO ED teachers: experienced secondary subject specialists teaching live online lessons." };

export default async function Teachers() {
  const ts = await getTeachers();
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Our Teachers</h1><p>Experienced secondary subject specialists, all with up-to-date DBS certificates.</p></div></section>
    <section className="s-sec"><div className="wrap"><div className="tgrid">{ts.map((t) =>
      <article className="tcard" key={t.name}><div className="tav" aria-hidden="true">{t.name.split(" ").map((p) => p[0]).join("")}</div>
        <h2>{t.name}</h2><p className="role">{t.designation}</p>{t.subjects?.length ? <p className="subs">{t.subjects.join(" · ")}</p> : null}
        {t.bio && <p className="bio">{t.bio}</p>}</article>)}</div></div></section>
  </>);
}
