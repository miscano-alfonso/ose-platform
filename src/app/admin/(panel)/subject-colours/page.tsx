import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { subjectColours } from "@/lib/subject-colours";
import { subjectColoursAction } from "./actions";

export const dynamic = "force-dynamic";

// Settings → Subject colours (23 Nov): the brand sheet's colours for each subject, in one place.
export default async function SubjectColours({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp] = await Promise.all([searchParams, requireStaff()]);
  const { groups, subjects } = await subjectColours();
  const others = subjects.filter((s) => !s.group);
  const pick = (name: string, label: string, v: string) => <label className="sc-pick"><input type="color" name={name} defaultValue={v.toLowerCase()} aria-label={label} /><span>{label}</span></label>;
  return <>
    <div className="top"><div><h1>Subject colours</h1><div className="sub">Your brand sheet’s colours for each subject. Sketch Studio draws with them (its own colour editor changes the same colours), and every subject in that group takes the main colour for Social’s pictures, the dashboards, the timetable, emails and the website’s course cards. The roundel pictures keep the colours they were made with: change those in Canva.</div></div></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}
    <form action={subjectColoursAction} style={{ display: "grid", gap: 16, maxWidth: 980 }}>
      <div className="sc-grid">
        {groups.map((g) => { const used = subjects.filter((s) => s.group === g.key).map((s) => s.name);
          return <div className="card sc-card" key={g.key}>
            <div className="sc-head"><span className="sc-dots" aria-hidden="true"><i style={{ background: g.main }} /><i style={{ background: g.shade }} /><i style={{ background: g.highlight }} /></span><b>{g.name}</b>{g.changed && <span className="pill">Changed</span>}</div>
            <div className="sc-picks">{pick(`${g.key}.main`, "Main", g.main)}{pick(`${g.key}.shade`, "Shade", g.shade)}{pick(`${g.key}.highlight`, "Highlight", g.highlight)}</div>
            <div className="muted sc-used">{used.length ? "Used for " + used.join(", ") : "No subjects in the timetable yet"}</div>
          </div>; })}
      </div>
      {others.length > 0 && <div className="card" style={{ display: "grid", gap: 10 }}>
        <b>Other subjects</b><div className="muted" style={{ fontSize: 14 }}>Subjects that aren’t in a group above keep a colour of their own.</div>
        <div className="sc-picks">{others.map((s) => pick(`sub.${s.id}`, s.name, s.colour))}</div>
      </div>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button className="abtn pri" type="submit">Save</button>
        <button className="abtn" type="submit" name="reset" value="1">Back to the brand sheet</button>
        <Link href="/studio" target="_blank">Open Sketch Studio</Link>
      </div>
    </form>
  </>;
}
