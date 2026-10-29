import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { LABEL_KEYS, labelWords } from "@/lib/course-labels";
import { courseLabelsAction } from "./actions";

export const dynamic = "force-dynamic";

// Settings → Course labels: the wording of the stickers on course cards ("Few spaces left", "Launching Soon!"…).
export default async function CourseLabels({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp] = await Promise.all([searchParams, requireStaff()]);
  const w = await labelWords();
  return <>
    <div className="top"><div><h1>Course labels</h1><div className="sub">The stickers on course cards on the website. Change the wording here; which label each class shows is set in <Link href="/admin/classes">Classes</Link> (Website label), or chosen automatically.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <form action={courseLabelsAction} className="card" style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      {LABEL_KEYS.map((k) => <label className="fld" key={k.key}>{k.hint}
        <input name={k.key} defaultValue={w[k.key]} maxLength={40} required /></label>)}
      <div><button className="abtn pri" type="submit">Save</button></div>
    </form>
  </>;
}
