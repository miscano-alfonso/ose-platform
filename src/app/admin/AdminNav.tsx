"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = [string, string];
// icons as in the prototype (20×20, drawn with a 1.6 stroke)
const P: Record<string, string> = {
  auto: "M11 2.5L4.5 11h5l-1 6.5L15.5 9h-5z", rec: "M3.5 5.5h9a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V7a1.5 1.5 0 0 1 1.5-1.5z M14 9l4-2.5v7L14 11", pic: "M3 4h14v12H3z M3 13l4-4 3 3 2-2 5 5 M12.5 7.5a1 1 0 1 0 0 .1",
  home: "M3 9l7-6 7 6v8H3z M8 17v-5h4v5", fam: "M7 4a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M2.5 16c.5-3 2.4-4.5 4.5-4.5s4 1.5 4.5 4.5 M14 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M11.5 16c.3-2 1.3-3.3 2.5-3.3s2.6 1 3 3.3",
  att: "M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M6.5 10l2.5 2.5 4.5-5", pay: "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V6A1.5 1.5 0 0 1 4 4.5z M2.5 8h15 M5.5 12.5h3",
  mail: "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V6A1.5 1.5 0 0 1 4 4.5z M3 5.5l7 5.5 7-5.5", wait: "M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15 M10 5.5V10l3 2",
  job: "M3 6.5h14v10H3z M7.5 6.5V4.5h5v2", rep: "M5 2.5h7l3 3v12H5z M8 9h5M8 12h5M8 15h3", cls: "M4 4h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 16 15H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 4z M6 18h8M10 15v3",
  cal: "M4 4h12a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 16 17H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 4z M2.5 8h15 M6.5 2v4M13.5 2v4", gbp: "M13.5 5.5A3 3 0 0 0 8 7v9M5.5 11h6M5 16h10",
  star: "M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8z", mkt: "M3 8v4h3l6 4V4L6 8z M15 7.5a3.5 3.5 0 0 1 0 5", chat: "M3 4h14v9H8l-4 3v-3H3z",
  price: "M10.5 2.5h6v6l-8 8-6-6z M13.5 4.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2", web: "M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15 M2.5 10h15 M10 2.5c2.2 2.3 2.2 12.7 0 15 M10 2.5c-2.2 2.3-2.2 12.7 0 15",
  set: "M10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8",
};
const ICON: Record<string, string> = { "/admin/families": "fam", "/admin/attendance": "att", "/admin/payments": "pay", "/admin/messages": "mail", "/admin/enquiries": "wait", "/admin/jobs": "job",
  "/admin/tasters": "att", "/admin/reports": "rep", "/admin/tutoring": "fam", "/admin/workshops": "cal", "/admin/student-chat": "chat", "/admin/rewards": "star", "/admin/payroll": "gbp",
  "/admin/email": "mail", "/admin/newsletter": "mail", "/admin/subscribers": "fam", "/admin/email-stats": "rep", "/admin/social": "mkt", "/admin/term-dates": "cal", "/admin/prices": "price",
  "/admin/classes": "cls", "/admin/timetable": "cal", "/admin/teachers": "fam", "/admin/website": "web", "/admin/home-ed": "web", "/admin/styles": "set", "/admin/staff": "set", "/admin/account": "set", "/admin/school": "set", "/admin": "home", "/admin/privacy": "set", "/admin/automations": "auto", "/admin/recordings": "rec", "/admin/designs": "pic", "/admin/marketing": "mkt" };
const Icon = ({ href }: { href: string }) => <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[ICON[href] ?? "home"]} /></svg>;
// The prototype's menu order; the newer sections (Jobs, Newsletter, Social…) sit after it, and website and school settings in groups.
const DAILY: Item[] = [
  ["Classes", "/admin/classes"], ["1:1 tutoring", "/admin/tutoring"], ["Workshops", "/admin/workshops"], ["Timetable", "/admin/timetable"],
  ["Families", "/admin/families"], ["Attendance", "/admin/attendance"], ["Recordings", "/admin/recordings"], ["Reports", "/admin/reports"], ["Payments", "/admin/payments"], ["Payroll", "/admin/payroll"],
  ["Prices & discounts", "/admin/prices"], ["Term dates", "/admin/term-dates"], ["Tasters", "/admin/tasters"], ["Waiting list & enquiries", "/admin/enquiries"],
  ["Messages", "/admin/messages"], ["Student chat", "/admin/student-chat"], ["Data protection", "/admin/privacy"], ["Rewards", "/admin/rewards"], ["Email", "/admin/email"], ["Automations", "/admin/automations"], ["Jobs", "/admin/jobs"],
];
const GROUPS: [string, Item[]][] = [
  ["Marketing", [["Overview", "/admin/marketing"], ["Newsletter", "/admin/newsletter"], ["Subscribers", "/admin/subscribers"], ["Email stats", "/admin/email-stats"], ["Social", "/admin/social"]]],
  ["Website", [["Website", "/admin/website"], ["Home Ed hub", "/admin/home-ed"], ["Page styles", "/admin/styles"]]],
  ["Settings", [["School settings", "/admin/school"], ["Teachers", "/admin/teachers"], ["Staff & access", "/admin/staff"], ["Account", "/admin/account"], ["EdTech trials", "/admin/edtech"]]],
];

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const path0 = usePathname(), path = path0 === "/admin/designs" ? "/admin/social" : path0; // More designs sits under Social
  const [open, setOpen] = useState(false);
  const here = (href: string) => path === href || (href !== "/admin" && path.startsWith(href + "/"));
  // One part of the menu open at a time: opening Year setup or Settings folds the main list away.
  const [section, setSection] = useState<string>(() => GROUPS.find(([, items]) => items.some(([, h]) => here(h)))?.[0] ?? "main");
  const link = ([label, href]: Item) => <Link key={label} href={href} aria-current={here(href) ? "page" : undefined} onClick={() => setOpen(false)}><Icon href={href} /><span>{label}</span>{counts[href] ? <b className="cnt">{counts[href]}</b> : null}</Link>;
  // Marketing and Website sit above the main list; Settings below it. The logo is the way to the dashboard.
  const group = ([name, items]: [string, Item[]]) => <div key={name} className="ngrp">
    <button type="button" className="ngrp-h" aria-expanded={section === name} onClick={() => setSection(section === name ? "main" : name)}>{name}</button>
    {section === name && <div className="ngrp-list">{items.map(link)}</div>}
  </div>;
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls="adm-nav" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id="adm-nav" className={`nav${open ? " open" : ""}`} aria-label="Admin">
      {GROUPS.filter(([n]) => n !== "Settings").map(group)}
      <div className="ngrp"><button type="button" className="ngrp-h" aria-expanded={section === "main"} onClick={() => setSection("main")}>Main menu</button>
        {section === "main" && <div className="ngrp-list">{DAILY.map(link)}</div>}</div>
      {GROUPS.filter(([n]) => n === "Settings").map(group)}
    </nav>
  </>;
}

// The teacher's own menu (as in the prototype's teacher view). Admins see it too while viewing as a teacher.
const TEACHER: [string, string, string][] = [["My day", "/admin/teacher", "home"], ["1:1s and workshops", "/admin/teacher/ones", "fam"], ["Messages", "/admin/teacher/messages", "mail"],
  ["Class chats", "/admin/teacher/chats", "chat"], ["Reward points", "/admin/points", "star"], ["Reports to write", "/admin/teacher/reports", "rep"],
  ["My timetable", "/admin/teacher/timetable", "cal"], ["My pay", "/admin/teacher/pay", "gbp"]];
export function TeacherNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const here = (href: string) => href === "/admin/teacher" ? path === href : path === href || path.startsWith(href + "/");
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls="t-nav" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id="t-nav" className={`nav${open ? " open" : ""}`} aria-label="Teacher">
      <div className="ngrp-list">{TEACHER.map(([label, href, ic]) => <Link key={href} href={href} aria-current={here(href) ? "page" : undefined} onClick={() => setOpen(false)}>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[ic]} /></svg>
        <span>{label}</span>{counts[href] ? <b className="cnt">{counts[href]}</b> : null}</Link>)}</div>
    </nav>
  </>;
}
