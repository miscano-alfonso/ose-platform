import type { Metadata } from "next";
import { after } from "next/server";
import { socialBackground } from "@/lib/social";
import { requireStaff } from "@/lib/auth";
import { withSchool } from "@/lib/db";
import { signOutAction } from "../actions";
import { AdminNav } from "../AdminNav";
import "../admin.css";
import { DashStyles } from "../DashStyles";
import { brandSrc } from "@/lib/brand";
import { cookies } from "next/headers";
import { listSchools, siteSchool, SCHOOL_COOKIE } from "@/lib/db";
import { Switchers } from "../Switchers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  after(() => socialBackground()); // scheduled Instagram posts and the weekly moments report, after the page is sent
  const { logo } = await brandSrc();
  const [c] = await withSchool((q) => q<{ enq: number; jobs: number; failed: number; tasters: number }>(`select (select count(*)::int from enquiries where handled_at is null) as enq,
    (select count(*)::int from job_applications where status = 'new') as jobs, (select count(*)::int from instalments where status = 'failed') as failed,
    (select count(*)::int from taster_bookings b join lesson_events ev on ev.id = b.lesson_event_id where b.status = 'booked' and ev.lesson_date between current_date and current_date + 7) as tasters`)).catch(async () =>
    withSchool((q) => q<{ enq: number; jobs: number; failed: number; tasters: number }>(`select (select count(*)::int from enquiries where handled_at is null) as enq, (select count(*)::int from job_applications where status = 'new') as jobs,
      (select count(*)::int from instalments where status = 'failed') as failed, 0 as tasters`)));
  const jar = await cookies();
  const [schools, teachers] = await Promise.all([listSchools(), withSchool((q) => q<{ id: string; name: string }>(`select u.id, u.name from teachers t join users u on u.id = t.user_id where t.archived_at is null and u.disabled_at is null order by u.name`))]);
  const school = jar.get(SCHOOL_COOKIE)?.value || siteSchool();
  const views = [{ value: "admin", label: "Admin" }, ...teachers.map((t) => ({ value: `t:${t.id}`, label: `Teacher: ${t.name}` })),
    { value: "p", label: "Parent (coming soon)", disabled: true }, { value: "s", label: "Student (coming soon)", disabled: true }];
  return <div className="adm"><DashStyles /><div className="app">
    <aside className="side">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a className="logo" href="/admin" title="Dashboard"><img src={logo} alt="OH-SO ED: go to the dashboard" width={773} height={224} /></a>
      <Switchers schools={schools.map((x) => ({ value: x.slug, label: x.name }))} school={school} views={views} view="admin" />
      <AdminNav counts={{ "/admin/enquiries": c.enq, "/admin/jobs": c.jobs, "/admin/payments": c.failed, "/admin/tasters": c.tasters }} />
      <div className="who"><span>Signed in as<br /><b>{me.name}</b></span>
        <form action={signOutAction}><button className="abtn sm side-btn" type="submit">Sign out</button></form>
        <a href="/" style={{ color: "#c9cde4", fontSize: 15.5 }}>View the website</a></div>
    </aside>
    <main className="main">{children}</main>
  </div></div>;
}
