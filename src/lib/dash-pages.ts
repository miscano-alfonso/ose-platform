// The modules each customisable admin page offers (5 Nov). A saved layout keeps only ids listed here, so a new module
// must be added to its page's list. The admin dashboard's own list is in actions.ts (DASH_MODULES).
export type Item = { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full"; h?: "s" | "m" | "l" };
export const PAGE_MODULES: Record<string, string[]> = {
  "admin-payments": ["k-collected", "k-next", "k-failed", "k-students", "failed", "upcoming", "byterm", "families"],
  "admin-marketing": ["m-enquiries", "m-tasters", "m-conversion", "m-waiting", "funnel", "campaigns", "audiences", "heard"],
};
export const PAGE_DEFAULTS: Record<string, Item[]> = {
  "admin-payments": [{ id: "k-collected", size: "q" }, { id: "k-next", size: "q" }, { id: "failed", size: "l" }, { id: "byterm", size: "l" }, { id: "upcoming", size: "l" }, { id: "families", size: "full" }],
  "admin-marketing": [{ id: "m-enquiries", size: "q" }, { id: "m-tasters", size: "q" }, { id: "m-conversion", size: "q" }, { id: "m-waiting", size: "q" },
    { id: "funnel", size: "l" }, { id: "audiences", size: "l" }, { id: "campaigns", size: "l" }, { id: "heard", size: "l" }],
};
