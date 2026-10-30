// The menus of the four dashboards (admin, teacher, parent, student): every page each one can link to, the
// standard arrangement, and how a school's own arrangement (saved from Admin → Menus) is applied.
// Safe to import on the client: no database access here.

export type MenuArea = "admin" | "teacher" | "parent" | "student";
export type MenuItem = { label: string; href: string; icon: string };
export type MenuGroup = { title: string; items: string[] };
export type MenuConfig = { groups: MenuGroup[]; hidden: string[] };
export type ResolvedGroup = { title: string; items: MenuItem[] };

export const MENU_AREAS: { id: MenuArea; label: string; root: string }[] = [
  { id: "admin", label: "Admin", root: "/admin" }, { id: "teacher", label: "Teacher", root: "/admin/teacher" },
  { id: "parent", label: "Parent", root: "/parent" }, { id: "student", label: "Student", root: "/student" },
];

// Icons, drawn on a 20×20 grid with a 1.6 stroke.
export const ICONS: Record<string, string> = {
  auto: "M11 2.5L4.5 11h5l-1 6.5L15.5 9h-5z", rec: "M3.5 5.5h9a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V7a1.5 1.5 0 0 1 1.5-1.5z M14 9l4-2.5v7L14 11", pic: "M3 4h14v12H3z M3 13l4-4 3 3 2-2 5 5 M12.5 7.5a1 1 0 1 0 0 .1",
  home: "M3 9l7-6 7 6v8H3z M8 17v-5h4v5", fam: "M7 4a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M2.5 16c.5-3 2.4-4.5 4.5-4.5s4 1.5 4.5 4.5 M14 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M11.5 16c.3-2 1.3-3.3 2.5-3.3s2.6 1 3 3.3",
  att: "M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M6.5 10l2.5 2.5 4.5-5", pay: "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V6A1.5 1.5 0 0 1 4 4.5z M2.5 8h15 M5.5 12.5h3",
  mail: "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V6A1.5 1.5 0 0 1 4 4.5z M3 5.5l7 5.5 7-5.5", wait: "M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15 M10 5.5V10l3 2",
  job: "M3 6.5h14v10H3z M7.5 6.5V4.5h5v2", rep: "M5 2.5h7l3 3v12H5z M8 9h5M8 12h5M8 15h3", cls: "M4 4h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 16 15H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 4z M6 18h8M10 15v3",
  cal: "M4 4h12a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 16 17H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 4z M2.5 8h15 M6.5 2v4M13.5 2v4", gbp: "M13.5 5.5A3 3 0 0 0 8 7v9M5.5 11h6M5 16h10",
  star: "M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8z", mkt: "M3 8v4h3l6 4V4L6 8z M15 7.5a3.5 3.5 0 0 1 0 5", chat: "M3 4h14v9H8l-4 3v-3H3z",
  price: "M10.5 2.5h6v6l-8 8-6-6z M13.5 4.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2", web: "M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15 M2.5 10h15 M10 2.5c2.2 2.3 2.2 12.7 0 15 M10 2.5c-2.2 2.3-2.2 12.7 0 15",
  set: "M10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8",
  menu: "M3 5h14M3 10h14M3 15h9",
};

const it = (label: string, href: string, icon: string): MenuItem => ({ label, href, icon });
/** The student's class links change with their enrolments, so the menu holds one placeholder that becomes one link per class. */
export const CLASSES_TOKEN = "@classes";

export const CATALOGUE: Record<MenuArea, MenuItem[]> = {
  admin: [
    it("Dashboard", "/admin", "home"), it("Classes", "/admin/classes", "cls"), it("1:1 tutoring", "/admin/tutoring", "fam"), it("Workshops", "/admin/workshops", "cal"), it("Timetable", "/admin/timetable", "cal"),
    it("Families", "/admin/families", "fam"), it("Attendance", "/admin/attendance", "att"), it("Recordings", "/admin/recordings", "rec"), it("Reports", "/admin/reports", "rep"),
    it("Payments", "/admin/payments", "pay"), it("Payroll", "/admin/payroll", "gbp"), it("Prices & discounts", "/admin/prices", "price"), it("Term dates", "/admin/term-dates", "cal"),
    it("Tasters", "/admin/tasters", "att"), it("Waiting list & enquiries", "/admin/enquiries", "wait"), it("Messages", "/admin/messages", "mail"), it("Student chat", "/admin/student-chat", "chat"),
    it("Data protection", "/admin/privacy", "set"), it("Rewards", "/admin/rewards", "star"), it("Email", "/admin/email", "mail"), it("Automations", "/admin/automations", "auto"), it("Jobs", "/admin/jobs", "job"),
    it("Overview", "/admin/marketing", "mkt"), it("Newsletter", "/admin/newsletter", "mail"), it("Subscribers", "/admin/subscribers", "fam"), it("Email stats", "/admin/email-stats", "rep"), it("Social", "/admin/social", "mkt"),
    it("Website", "/admin/website", "web"), it("EdTech website", "/admin/cms", "web"), it("Home Ed hub", "/admin/home-ed", "web"), it("Page styles", "/admin/styles", "set"),
    it("School settings", "/admin/school", "set"), it("Teachers", "/admin/teachers", "fam"), it("Staff & access", "/admin/staff", "set"), it("Account", "/admin/account", "set"),
    it("EdTech trials", "/admin/edtech", "set"), it("Solo dashboard", "/admin/solo-dashboard", "home"), it("Menus", "/admin/menus", "menu"), it("Timetable setup", "/admin/timetable-setup", "cal"), it("1:1 tutoring setup", "/admin/tutoring-setup", "fam"), it("Test mode", "/admin/test-mode", "set"), it("Notifications", "/admin/notifications", "set"), it("Email", "/admin/email-settings", "mail"), it("Course labels", "/admin/course-labels", "set"),
  ],
  teacher: [
    it("My day", "/admin/teacher", "home"), it("1:1s and workshops", "/admin/teacher/ones", "fam"), it("Messages", "/admin/teacher/messages", "mail"), it("Email", "/admin/teacher/email", "mail"), it("Class chats", "/admin/teacher/chats", "chat"),
    it("Reward points", "/admin/points", "star"), it("Reports to write", "/admin/teacher/reports", "rep"), it("My timetable", "/admin/teacher/timetable", "cal"), it("Calendar sync", "/admin/teacher/calendar", "cal"), it("Google Drive", "/admin/teacher/drive", "set"), it("Notifications", "/admin/teacher/notifications", "set"), it("My pay", "/admin/teacher/pay", "gbp"),
  ],
  parent: [
    it("Home", "/parent", "home"), it("Attendance", "/parent/attendance", "att"), it("Assignments", "/parent/assignments", "rep"), it("Book a 1:1", "/parent/book", "fam"),
    it("Workshops", "/parent/workshops", "cal"), it("Messages", "/parent/messages", "mail"), it("Other parents", "/parent/connect", "fam"), it("My details", "/parent/details", "set"),
    it("Privacy", "/parent/privacy", "set"), it("Reports", "/parent/reports", "rep"), it("Payments", "/parent/payments", "pay"), it("Calendar sync", "/parent/calendar", "cal"), it("Notifications", "/parent/notifications", "set"),
  ],
  student: [it("Home", "/student", "home"), it("My classes", CLASSES_TOKEN, "cls"), it("Chat", "/student/chat", "chat"), it("Rewards", "/student/rewards", "star"), it("Calendar sync", "/student/calendar", "cal"), it("Notifications", "/student/notifications", "set")],
};

const hrefs = (a: MenuArea, ...ls: string[]) => ls.map((l) => l.startsWith("/") ? l : CATALOGUE[a].find((x) => x.label === l)!.href);   // a label, or the link itself when two items share a label
export const DEFAULT_MENUS: Record<MenuArea, MenuConfig> = {
  admin: { hidden: [], groups: [
    { title: "Marketing", items: hrefs("admin", "Overview", "Newsletter", "Subscribers", "Email stats", "Social") },
    { title: "Website", items: hrefs("admin", "Website", "Home Ed hub", "Page styles", "EdTech website") },
    { title: "Main menu", items: CATALOGUE.admin.slice(0, 22).map((x) => x.href) }, // Dashboard first, then the daily pages
    { title: "Settings", items: hrefs("admin", "School settings", "/admin/email-settings", "Notifications", "Course labels", "Test mode", "Timetable setup", "1:1 tutoring setup", "Teachers", "Staff & access", "Account", "EdTech trials", "Solo dashboard", "Menus") },
  ] },
  teacher: { hidden: [], groups: [{ title: "Menu", items: CATALOGUE.teacher.map((x) => x.href) }] },
  parent: { hidden: [], groups: [{ title: "Menu", items: CATALOGUE.parent.map((x) => x.href) }] },
  student: { hidden: [], groups: [{ title: "Menu", items: CATALOGUE.student.map((x) => x.href) }] },
};

/** Links that can't be hidden, so the menu editor and each home page stay reachable. */
export const LOCKED = new Set(["/admin", "/admin/menus", "/admin/teacher", "/parent", "/student"]);

/** Tidy a saved arrangement against the catalogue: unknown links dropped, duplicates removed, and any page added to
 *  the platform since it was saved appended to the last group so nothing new goes missing. */
export function cleanMenu(area: MenuArea, raw: unknown): MenuConfig {
  const known = new Set(CATALOGUE[area].map((x) => x.href)), seen = new Set<string>();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MenuConfig>;
  const take = (h: unknown) => typeof h === "string" && known.has(h) && !seen.has(h) && (seen.add(h), true);
  const groups = (Array.isArray(r.groups) ? r.groups : []).slice(0, 12).map((g) => ({
    title: String(g?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Menu",
    items: (Array.isArray(g?.items) ? g.items : []).filter(take) as string[],
  }));
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((h) => !LOCKED.has(String(h))).filter(take) as string[];
  if (!groups.length) return DEFAULT_MENUS[area];
  const missing = CATALOGUE[area].map((x) => x.href).filter((h) => !seen.has(h));
  // a home page added later goes to the top of the main group; anything else new goes at the end of the last group
  const home = MENU_AREAS.find((a) => a.id === area)!.root;
  if (missing.includes(home)) { (groups.find((g) => g.title === "Main menu") ?? groups[0]).items.unshift(home); missing.splice(missing.indexOf(home), 1); }
  groups[groups.length - 1].items.push(...missing);
  return { groups, hidden };
}

/** The menu to draw: groups of links, with the student's class placeholder expanded. Empty groups are left out. */
export function resolveMenu(area: MenuArea, cfg: MenuConfig | null, classes: MenuItem[] = []): ResolvedGroup[] {
  const c = cfg ?? DEFAULT_MENUS[area], byHref = new Map(CATALOGUE[area].map((x) => [x.href, x]));
  return c.groups.map((g) => ({ title: g.title, items: g.items.flatMap((h) => h === CLASSES_TOKEN ? classes : byHref.has(h) ? [byHref.get(h)!] : []) }))
    .filter((g) => g.items.length);
}
