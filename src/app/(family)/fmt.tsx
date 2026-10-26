export const dm = (d: string) => new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
export const dlong = (d: string) => new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
export const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const MARK: Record<string, [string, string, string]> = { present: ["Present", "m-present", "✓"], late: ["Late", "m-late", "L"], absent: ["Absent", "m-absent", "✗"], approved_absence: ["Approved absence", "m-approved_absence", "E"] };
export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  return <>{sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}</>;
}
export function Head({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="top"><div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>{children && <><span className="grow" />{children}</>}</div>;
}
