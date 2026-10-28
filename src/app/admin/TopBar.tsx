import { ThemeToggle } from "./ThemeToggle";
import { SideToggle } from "./SideToggle";

/** The bar along the top of the admin and teacher dashboards: the button that hides and shows the menu. */
export function TopBar() {
  return <div className="topbar"><SideToggle /></div>;
}

/** The bottom of the side menu, always in view: the School / Viewing as switchers (admins), Light / Dark, Sign out, and the website link. */
export function SideFoot({ theme, signOut, switchers, site }: { theme?: string; signOut?: (f: FormData) => Promise<void>; switchers?: React.ReactNode; site?: { href: string; label: string }[] }) {
  return <div className="side-foot">
    {switchers}
    <div className="sf-row"><ThemeToggle initial={theme ?? "auto"} />{signOut && <form action={signOut}><button className="abtn sm" type="submit">Sign out</button></form>}</div>
    {site && site.length > 0 && <div className="sf-links">{site.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</div>}
  </div>;
}
