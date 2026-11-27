import { ThemeToggle } from "./ThemeToggle";
import { SideToggle } from "./SideToggle";

/** The bar along the top of the admin and teacher dashboards: notes such as "Test mode is on" (the menu's hide button is now at the bottom of the menu). */
export function TopBar({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="topbar"><div className="tb-note">{children}</div></div>;
}

/** The bottom of the side menu, always in view: the School / Viewing as switchers (admins), then Sign out on the left and,
 *  on the right, the light/dark switch (as on the website) and the button that hides the menu. */
export function SideFoot({ theme, signOut, switchers, site, preview, inline, toggle, note, settings, mode, home }: { home?: { href: string; label: string }; mode?: "admin" | "teacher"; settings?: string; theme?: string; signOut?: (f: FormData) => Promise<void>; switchers?: React.ReactNode; site?: { href: string; label: string }[]; preview?: boolean; inline?: boolean; toggle?: boolean; note?: React.ReactNode }) {
  return <div className={`side-foot${inline ? " inline" : ""}`}>
    {switchers}
    {mode && <div className="mode-seg" role="group" aria-label="Dashboard mode">
      <a href="/admin/mode?to=admin" aria-current={mode === "admin" ? "true" : undefined}>Admin</a>
      <a href="/admin/mode?to=teacher" aria-current={mode === "teacher" ? "true" : undefined}>Teacher</a></div>}
    {/* 27 Nov (Alfonso): Sign out level with the Test mode pill (on the right); the website link level with the round buttons */}
    <div className="sf-row sf-top">{signOut && <form action={signOut}><button className="abtn sm" type="submit">Sign out</button></form>}{!signOut && preview && <button className="abtn sm" type="button" disabled title="The parent or student sees Sign out here. You’re only viewing.">Sign out</button>}
      {settings && <a className="sf-icon" href={settings} title="Settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg></a>}<span className="sf-grow" />{note}</div>
    <div className="sf-row">{site && site.length > 0 ? <div className="sf-links">{site.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</div> : null}
      <span className="sf-grow" /><ThemeToggle initial={theme ?? "auto"} />{toggle && <SideToggle home={home} />}</div>
  </div>;
}
