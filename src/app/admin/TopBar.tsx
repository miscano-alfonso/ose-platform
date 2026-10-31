import { ThemeToggle } from "./ThemeToggle";
import { SideToggle } from "./SideToggle";

/** The bar along the top of the admin and teacher dashboards: notes such as "Test mode is on" (the menu's hide button is now at the bottom of the menu). */
export function TopBar({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="topbar"><div className="tb-note">{children}</div></div>;
}

/** The bottom of the side menu, always in view: the School / Viewing as switchers (admins), then Sign out on the left and,
 *  on the right, the light/dark switch (as on the website) and the button that hides the menu. */
export function SideFoot({ theme, signOut, switchers, site, preview, inline, toggle }: { theme?: string; signOut?: (f: FormData) => Promise<void>; switchers?: React.ReactNode; site?: { href: string; label: string }[]; preview?: boolean; inline?: boolean; toggle?: boolean }) {
  return <div className={`side-foot${inline ? " inline" : ""}`}>
    {switchers}
    <div className="sf-row">{signOut && <form action={signOut}><button className="abtn sm" type="submit">Sign out</button></form>}{!signOut && preview && <button className="abtn sm" type="button" disabled title="The parent or student sees Sign out here. You’re only viewing.">Sign out</button>}
      <span className="sf-grow" /><ThemeToggle initial={theme ?? "auto"} />{toggle && <SideToggle />}</div>
    {site && site.length > 0 && <div className="sf-links">{site.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</div>}
  </div>;
}
