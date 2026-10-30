import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { withSchool, isPlatformSchool } from "@/lib/db";
import { soloLayout } from "@/lib/dashboard-layout";
import { BOARD_MODULES } from "@/lib/dash-modules";
import { BentoBoard } from "../../BentoBoard";
import { soloModules, SOLO_BUILT_IN } from "../../dash/solo-board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Solo dashboard" };

// Settings → Solo dashboard (OH-SO ED only): arrange the one dashboard that OH-SO EdTech Solo schools see, where the
// admin is also the only teacher. Shown here with OH-SO ED's own data, with a teacher's lessons for the teaching modules.
export default async function SoloDashboard({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const me = await requireStaff();
  if (!(await isPlatformSchool())) redirect("/admin");
  const sp = await searchParams;
  const teachers = await withSchool((q) => q<{ id: string; name: string }>(`select u.id, u.name from teachers t join users u on u.id = t.user_id
    where t.archived_at is null and u.disabled_at is null order by u.name`));
  const teacher = teachers.find((x) => x.id === sp.t) ?? teachers[0] ?? { id: me.id, name: me.name };
  const known = BOARD_MODULES["solo-home"];
  const [modules, b] = await Promise.all([soloModules(me, teacher), soloLayout(known, SOLO_BUILT_IN)]);
  return <>
    <div className="top"><div><h1>Solo dashboard</h1><div className="sub">The home page every OH-SO EdTech Solo school sees: one person runs the school and teaches, so the admin dashboard and the teacher’s My day are one board.
      Arrange it here (Customise) and every Solo school shows it; they can’t change it themselves. It’s shown with OH-SO ED’s figures, and the teaching modules use one teacher’s lessons.</div></div>
      <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}><label className="fld" style={{ margin: 0 }}>Teaching modules show<select name="t" defaultValue={teacher.id} className="mini">
        {teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button className="abtn sm" type="submit">Show</button></form></div>
    <div className="fx fx-board"><BentoBoard page="solo-home" modules={modules} layout={b.layout} defaults={SOLO_BUILT_IN} saved={b.std} scope="standard" audience="Solo schools" /></div>
  </>;
}
