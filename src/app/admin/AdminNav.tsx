"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = [string, string];
// Day-to-day work stays at the top level; things set once a year, and school settings, sit in groups.
const DAILY: Item[] = [
  ["Families", "/admin/families"], ["Attendance", "/admin/attendance"], ["Payments", "/admin/payments"], ["Messages", "/admin/messages"],
  ["Waiting list & enquiries", "/admin/enquiries"], ["Jobs", "/admin/jobs"], ["Tasters", "/admin/tasters"], ["Reports", "/admin/reports"], ["1:1 tutoring", "/admin/tutoring"], ["Workshops", "/admin/workshops"],
  ["Student chat", "/admin/student-chat"], ["Rewards", "/admin/rewards"], ["Payroll", "/admin/payroll"], ["Email", "/admin/email"], ["Marketing", "/admin/marketing"], ["Social", "/admin/social"],
];
const GROUPS: [string, Item[]][] = [
  ["Year setup", [["Term dates", "/admin/term-dates"], ["Prices & rules", "/admin/prices"], ["Classes", "/admin/classes"], ["Timetable", "/admin/timetable"]]],
  ["Settings", [["Teachers", "/admin/teachers"], ["Website", "/admin/website"], ["Home Ed hub", "/admin/home-ed"], ["Page styles", "/admin/styles"], ["Staff & access", "/admin/staff"], ["Account", "/admin/account"]]],
];

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const here = (href: string) => path === href || (href !== "/admin" && path.startsWith(href + "/"));
  // One part of the menu open at a time: opening Year setup or Settings folds the main list away.
  const [section, setSection] = useState<string>(() => GROUPS.find(([, items]) => items.some(([, h]) => here(h)))?.[0] ?? "main");
  const link = ([label, href]: Item) => <Link key={label} href={href} aria-current={here(href) ? "page" : undefined} onClick={() => setOpen(false)}>{label}{counts[href] ? <b className="cnt">{counts[href]}</b> : null}</Link>;
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls="adm-nav" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id="adm-nav" className={`nav${open ? " open" : ""}`} aria-label="Admin">
      {section !== "main" && <button type="button" className="ngrp-h main-h" aria-expanded={false} onClick={() => setSection("main")}>Main menu</button>}
      {section === "main" && <div className="ngrp-list">{DAILY.map(link)}</div>}
      {GROUPS.map(([name, items]) => <div key={name} className="ngrp">
        <button type="button" className="ngrp-h" aria-expanded={section === name} onClick={() => setSection(section === name ? "main" : name)}>{name}</button>
        {section === name && <div className="ngrp-list">{items.map(link)}</div>}
      </div>)}
    </nav>
  </>;
}
