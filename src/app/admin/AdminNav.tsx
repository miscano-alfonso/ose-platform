"use client";
import { MenuNav, SectionTabs } from "../MenuNav";
import type { ResolvedGroup } from "@/lib/menus";

// The admin's and teacher's menus. What's in them, in what order and which groups, is set in Admin → Menus.
export function AdminNav({ counts, groups }: { counts: Record<string, number>; groups: ResolvedGroup[] }) {
  return <MenuNav id="adm-nav" label="Admin" root="/admin" groups={groups} counts={counts} alias={ALIAS} tabbed />; // the sections are tabs across the top (AdminTabs)
}
const ALIAS = { "/admin/designs": "/admin/social", "/admin/attendance": "/admin/students" };   // Attendance is part of Students (5 Nov)   // More designs sits under Social
/** The admin's menu sections as tabs along the top of the page (4 Nov): choosing one changes the side menu. */
export function AdminTabs({ counts, groups }: { counts: Record<string, number>; groups: ResolvedGroup[] }) {
  return <SectionTabs groups={groups} counts={counts} root="/admin" alias={ALIAS} />;
}
export function TeacherNav({ counts, groups }: { counts: Record<string, number>; groups: ResolvedGroup[] }) {
  return <MenuNav id="t-nav" label="Teacher" root="/admin/teacher" groups={groups} counts={counts} />;
}
