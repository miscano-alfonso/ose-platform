import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getMenuConfig } from "@/lib/menu-config";
import { DEFAULT_MENUS, MENU_AREAS, type MenuArea } from "@/lib/menus";
import { MenuEditor } from "../../MenuEditor";

export const metadata = { title: "Menus" };

// Admin → Menus: arrange the side menu of each dashboard (admin, teacher, parent, student) for the whole school.
export default async function MenusPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const area = (MENU_AREAS.find((a) => a.id === sp.area)?.id ?? "admin") as MenuArea;
  const saved = await getMenuConfig(area);
  return <>
    <div className="top"><div><h1>Menus</h1><div className="sub">Arrange the side menu of each dashboard. Drag links to reorder them or move them between groups, rename or add groups, and hide pages you don’t use. Saving changes the menu for everyone who uses that dashboard.</div></div></div>
    <nav className="tabs" style={{ marginBottom: 14 }} aria-label="Dashboards">{MENU_AREAS.map((a) => <Link key={a.id} href={`/admin/menus?area=${a.id}`} aria-current={a.id === area ? "page" : undefined} className={`abtn sm${a.id === area ? " pri" : ""}`}>{a.label}</Link>)}</nav>
    <p className="muted" style={{ fontSize: 15, margin: "0 0 12px" }}>Links marked ● always stay in the menu.{area === "student" ? " “My classes” becomes one link for each class the student is in." : ""}</p>
    <MenuEditor key={area} area={area} initial={saved ?? DEFAULT_MENUS[area]} saved={!!saved} />
  </>;
}
