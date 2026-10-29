// Small pieces shared by the Bento home pages (admin, teacher, parent, student).
export function Ring({ pct, tone = "brand" }: { pct: number | null; tone?: "brand" | "good" | "warn" | "bad" }) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct ?? 0));
  return <svg className={`dx-ring ${tone}`} viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={r} className="trk" />
    <circle cx="32" cy="32" r={r} className="val" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 32 32)" /></svg>;
}
export const Ico = ({ d }: { d: string }) => <span className="dx-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span>;
export const IC = {
  cal: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3 10h18 M8 3v4M16 3v4",
  pound: "M15.5 6.5A3.5 3.5 0 0 0 9 8.5V19M6 13h7M6 19h12", chat: "M4 5h16v11H10l-5 4v-4H4z", star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  users: "M9 5a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M3 20c.6-3.6 2.9-5.4 6-5.4s5.4 1.8 6 5.4 M17 7a2.5 2.5 0 1 0 0 5 M16.5 14.6c2.4.3 4 1.9 4.5 5.4",
  doc: "M6 3h9l4 4v14H6z M9 11h7M9 15h7M9 19h4", check: "M5 12.5l4.5 4.5L19 7.5",
};
/** "3rd", "11th", "22nd" */
export const ordinal = (n: number) => n + (["th", "st", "nd", "rd"][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]);
/** "in 8 minutes", "in 3 hours", "Thu 14:00" — for a lesson start. */
export function whenText(iso: string, now = Date.now()): string {
  const m = Math.round((Date.parse(iso) - now) / 60e3);
  if (m <= 0) return "on now";
  if (m < 60) return `starts in ${m} minute${m === 1 ? "" : "s"}`;
  if (m < 6 * 60) return `starts in ${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
