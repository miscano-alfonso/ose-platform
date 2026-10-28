import { ThemeToggle } from "./ThemeToggle";
import { SideToggle } from "./SideToggle";

/** The bar along the top of every dashboard: hide/show the menu on the left; the website, colours and Sign out on the right. */
export function TopBar({ theme, signOut, links = [{ href: "/", label: "View the website" }], menuToggle = true }: {
  theme?: string; signOut?: (f: FormData) => Promise<void>; links?: { href: string; label: string }[]; menuToggle?: boolean }) {
  return <div className="topbar">
    {menuToggle && <SideToggle />}
    <span className="grow" />
    {links.map((l) => <a key={l.href} href={l.href} className="tb-link">{l.label}</a>)}
    <ThemeToggle initial={theme ?? "auto"} />
    {signOut && <form action={signOut}><button className="abtn sm" type="submit">Sign out</button></form>}
  </div>;
}
