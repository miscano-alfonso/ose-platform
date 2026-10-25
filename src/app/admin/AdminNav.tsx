"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Sections from the admin prototype. Those without a link are still being moved across.
const ITEMS: [string, string | null][] = [
  ["Dashboard", "/admin"], ["Classes", "/admin/classes"], ["1:1 tutoring", null], ["Workshops", "/admin/workshops"], ["Timetable", null],
  ["Families", "/admin/families"], ["Attendance", null], ["Reports", null], ["Payments", "/admin/payments"], ["Payroll", null],
  ["Prices & discounts", "/admin/prices"], ["Term dates", "/admin/term-dates"], ["Tasters", null], ["Waiting list & enquiries", "/admin/enquiries"],
  ["Messages", null], ["Student chat", null], ["Rewards", null], ["Email", null], ["Marketing", null], ["Website", null], ["Staff & access", "/admin/staff"], ["Settings", "/admin/account"],
];

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return <>
    <button className="abtn side-btn menu-toggle" aria-expanded={open} aria-controls="adm-nav" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
    <nav id="adm-nav" className={`nav${open ? " open" : ""}`} aria-label="Admin">
      {ITEMS.map(([label, href]) => href
        ? <Link key={label} href={href} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}{counts[href] ? <b className="cnt">{counts[href]}</b> : null}</Link>
        : <span key={label} title="Coming next">{label}<small>Soon</small></span>)}
    </nav>
  </>;
}
