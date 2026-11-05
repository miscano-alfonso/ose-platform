import "server-only";
import { withSchool } from "./db";
import { getDashboard, getDashboardMore } from "./admin-data";
import { getLayout, saveLayout } from "./dashboard-layout";
import { money, dayMonth } from "./format";

// Summary boxes on any admin page (5 Nov): the dashboard's little boxes (students enrolled, next charge…) can sit under
// the title of any page in the menu. Each person picks which, per page ("Boxes" beside the title); the choice is kept
// in dashboard_layouts as page "box-<page>". Payments and Families start with a couple.

export type Box = { id: string; k: string; v: string; h: string; icon: keyof typeof ICONS; href?: string; tone?: "alert" | "ok"; ring?: { pct: number | null; tone: string }; meter?: number };
export const ICONS = {
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-4-5",
  pound: "M16 6a4 4 0 0 0-7 2v4H6M6 12h8M9 12v3c0 2-1 4-3 5h12",
  cal: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  check: "M4 12l5 5L20 6",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  inbox: "M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z",
} as const;
export const CATALOGUE: { id: string; title: string }[] = [
  { id: "k-students", title: "Students enrolled" }, { id: "k-places", title: "Class places filled" }, { id: "k-attendance", title: "Attendance this term" },
  { id: "k-collected", title: "Collected this year" }, { id: "k-next", title: "Next charge" }, { id: "k-failed", title: "Failed payments" },
  { id: "k-tasters", title: "Tasters this week" }, { id: "k-enquiries", title: "Open enquiries" }, { id: "k-email", title: "Unread emails" }, { id: "k-messages", title: "Messages waiting" },
];
const KNOWN = CATALOGUE.map((c) => c.id);
const DEFAULTS: Record<string, string[]> = { payments: ["k-collected", "k-next"], families: ["k-students", "k-failed"] };

/** "box-<page>" for a page in the admin menu (not the dashboard itself), else null. */
export function boxPage(path: string): { page: string; slug: string } | null {
  const m = /^\/admin\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)$/.exec(path.split("?")[0]);
  if (!m || m[1].startsWith("teacher") || m[1].includes("/")) return null;
  const slug = m[1].replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34);
  return slug ? { page: `box-${slug}`, slug } : null;
}

export async function chosenBoxes(userId: string, path: string): Promise<{ ids: string[]; saved: boolean } | null> {
  const p = boxPage(path); if (!p) return null;
  const { CATALOGUE: MENU } = await import("./menus");
  if (!MENU.admin.some((x) => x.href === path.split("?")[0])) return null;   // only pages in the menu
  const saved = await getLayout(userId, p.page, KNOWN).catch(() => null);
  return { ids: saved ? saved.map((x) => x.id) : DEFAULTS[p.slug] ?? [], saved: !!saved };
}
export async function saveBoxes(userId: string, path: string, ids: string[] | null) {
  const p = boxPage(path); if (!p) return;
  await saveLayout(userId, p.page, ids ? ids.filter((x) => KNOWN.includes(x)).slice(0, 8).map((id) => ({ id, size: "s" as const })) : null, KNOWN);
}

/** The boxes' figures. Only what the chosen boxes need is worked out. */
export async function boxValues(ids: string[]): Promise<Box[]> {
  if (!ids.length) return [];
  const need = (...x: string[]) => x.some((y) => ids.includes(y));
  const [{ t }, more, extra, unread] = await Promise.all([
    getDashboard(),
    need("k-attendance", "k-collected") ? getDashboardMore(50) : Promise.resolve(null),
    need("k-tasters", "k-messages") ? withSchool((q) => q<{ tasters: number; requests: number; waiting: number; replies: number }>(`select
        (select count(*)::int from taster_bookings b join lesson_events ev on ev.id = b.lesson_event_id where b.status = 'booked' and ev.lesson_date between current_date and current_date + 7) as tasters,
        (select count(*)::int from taster_requests r where r.created_at > now() - interval '60 days' and not exists (select 1 from taster_bookings b where b.request_id = r.id)) as requests,
        (select count(*)::int from message_threads th where th.status = 'open' and th.last_message_at < now() - interval '2 days'
          and (select m.sender from messages m where m.thread_id = th.id order by m.created_at desc limit 1) = 'parent') as waiting,
        (select count(distinct thread_id)::int from office_messages where sender <> 'office' and read_at is null) as replies`)).then((r) => r[0]).catch(() => null) : Promise.resolve(null),
    need("k-email") ? import("./inbox").then((m) => m.unreadInbox()).catch(() => 0) : Promise.resolve(0),
  ]);
  const out: Record<string, Box> = {};
  const pct = t.capacity ? Math.round((t.taken / t.capacity) * 100) : 0;
  out["k-students"] = { id: "k-students", icon: "users", k: "Students enrolled", v: String(t.students), h: `from ${t.families} famil${t.families === 1 ? "y" : "ies"}`, href: "/admin/families" };
  out["k-places"] = { id: "k-places", icon: "users", k: "Class places filled", v: `${pct}%`, h: `${t.taken} of ${t.capacity} places`, ring: { pct, tone: "brand" }, href: "/admin/classes" };
  if (more) {
    const a = more.att.pct;
    out["k-attendance"] = { id: "k-attendance", icon: "check", k: "Attendance this term", v: a == null ? "–" : `${a}%`, h: a == null ? "no lessons marked yet" : more.att.low.length ? `${more.att.low.length} below 50%` : "nobody below 50%",
      ring: { pct: a, tone: a == null ? "brand" : a >= 90 ? "good" : a >= 75 ? "brand" : a >= 50 ? "warn" : "bad" }, href: "/admin/attendance" };
    const billed = more.byTerm.reduce((s, x) => s + x.billed, 0);
    out["k-collected"] = { id: "k-collected", icon: "pound", k: "Collected this year", v: money(t.collected), h: billed ? `of ${money(billed)} billed this year` : "paid instalments", meter: billed ? Math.min(100, (t.collected / billed) * 100) : 0, href: "/admin/payments" };
  }
  out["k-next"] = { id: "k-next", icon: "cal", k: `Next charge${t.next_bills_on ? ` · ${dayMonth(t.next_bills_on)}` : ""}`, v: money(t.next_amount), h: `${t.next_families} families${t.next_term ? ` · ${t.next_term}` : ""}`, href: "/admin/payments" };
  out["k-failed"] = { id: "k-failed", icon: t.failed_count ? "alert" : "check", k: "Failed payments", v: String(t.failed_count), h: t.failed_count ? `${money(t.failed_amount)} to recover` : "Nothing to chase", tone: t.failed_count ? "alert" : "ok", href: "/admin/payments" };
  if (extra) {
    out["k-tasters"] = { id: "k-tasters", icon: "star", k: "Tasters this week", v: String(extra.tasters), h: extra.requests ? `${extra.requests} new request${extra.requests === 1 ? "" : "s"} to book` : "no new requests", href: "/admin/tasters" };
    const w = extra.waiting + extra.replies;
    out["k-messages"] = { id: "k-messages", icon: "mail", k: "Messages waiting", v: String(w), h: w ? [extra.waiting && `${extra.waiting} parent${extra.waiting === 1 ? "" : "s"} waiting 2+ days`, extra.replies && `${extra.replies} new repl${extra.replies === 1 ? "y" : "ies"} to the office`].filter(Boolean).join(" · ") : "all answered", tone: w ? "alert" : "ok", href: "/admin/messages" };
  }
  out["k-enquiries"] = { id: "k-enquiries", icon: "inbox", k: "Open enquiries", v: String(t.enquiries_open), h: `${t.waiting} on the waiting list`, href: "/admin/enquiries" };
  out["k-email"] = { id: "k-email", icon: "mail", k: "Unread emails", v: String(unread), h: unread ? "from families and others" : "all read", href: "/admin/email?tab=inbox" };
  return ids.map((id) => out[id]).filter(Boolean);
}
