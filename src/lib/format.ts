export const money = (pence: number) => {
  const p = Math.round(pence) / 100;
  return "£" + p.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(p) ? 0 : 2, maximumFractionDigits: 2 });
};
const d = (iso: string) => new Date(iso + "T12:00:00Z");
export const dayMonth = (iso: string) => d(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
export const monthYear = (iso: string) => d(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const yearLabel = (label: string) => label.replace("/", "–");
export const weeks = (a: string, b: string) => Math.ceil((Math.round((d(b).getTime() - d(a).getTime()) / 864e5) + 1) / 7);
