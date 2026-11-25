import { NotifyCenter } from "../NotifyCenter";
import "../admin/admin.css";
import { DashStyles } from "../admin/DashStyles";
import { brandSrc } from "@/lib/brand";
import { withSchool } from "@/lib/db";
import type { Family } from "@/lib/family-auth";
import { familySignOutAction } from "./actions";
import { FamilyNav } from "./FamilyNav";
import { LessonWindow } from "../LessonWindow";
import type { ResolvedGroup } from "@/lib/menus";
import { SideFoot } from "../admin/TopBar";
import { cookies } from "next/headers";

// The parent and student areas share the admin's look: brand-coloured menu on the left, pages on the right.
export async function Shell({ f, groups, counts = {}, root, children }: { f: Family; groups: ResolvedGroup[]; counts?: Record<string, number>; root: string; children: React.ReactNode }) {
  const { logo } = await brandSrc();
  const tv = (await cookies()).get("ose_theme")?.value, theme = tv === "light" || tv === "dark" ? tv : undefined;
  const sch = (await withSchool((q) => q<{ brand: { primary?: string; accent?: string }; name: string; is_demo: boolean }>(`select brand, name, is_demo from schools where id = current_school()`)))[0];
  const brand = sch?.brand ?? {};
  const hex = (v: unknown, d: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  return <div className="adm" data-theme={theme} data-palette={sch?.is_demo ? "demo" : undefined} style={{ ["--brand" as string]: hex(brand.primary, "#0f1747"), ["--brand-accent" as string]: hex(brand.accent, "#e3cd4b") }}><DashStyles />
    {f.viewer && <form action={familySignOutAction} className="viewbar"><span>Viewing as <b>{f.first} {f.last}</b> ({f.kind}). You see exactly what they see; nothing can be changed or sent from here.</span>
      <button className="abtn sm" type="submit">Back to the admin</button></form>}
    <LessonWindow /><NotifyCenter api={`${root}/notify-api`} role={f.kind} /><div className="app">
      <aside className="side">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {sch?.is_demo ? <a className="logo" href={root} title="Home" style={{ font: "600 24px/1.1 Jost, sans-serif", letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>{sch.name}<br /><span style={{ fontSize: 12, letterSpacing: ".2em", opacity: .8 }}>Demo school</span></a>
          : <a className="logo" href={root} title="Home"><img src={logo} alt="OH-SO ED: home" width={773} height={224} /></a>}
        <FamilyNav groups={groups} counts={counts} root={root} />
        <SideFoot theme={theme} signOut={f.viewer ? undefined : familySignOutAction} preview={!!f.viewer} inline site={[{ href: "/", label: "View the website" }]} />

      </aside>
      <main className="main">{children}</main>
    </div></div>;
}
