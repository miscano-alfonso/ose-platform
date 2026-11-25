import { cookies } from "next/headers";

// Shown in Demo Academy's teacher, parent and student dashboards to people who opened them from /newdashboard/<role>
// (in place of the "Viewing as" bar): it's made up, and how to get back.
export async function newDashRole(isDemo: boolean | undefined): Promise<string | null> {
  if (!isDemo) return null;
  const v = (await cookies()).get("ose_nd")?.value ?? "";
  return ["teacher", "parent", "student"].includes(v) ? v : null;
}
export function NewDashDemoBar({ role }: { role: string }) {
  return <div className="viewbar"><span><b>Demo {role} dashboard.</b> Everything here is made up, so click anything: nothing is ever emailed, charged or posted.</span>
    <span className="viewbar-btns"><a className="abtn sm" href={`/newdashboard/${role}`}>Back to the introduction</a><a className="abtn sm" href={`/newdashboard/${role}/demo/leave`}>Leave the demo</a></span></div>;
}
