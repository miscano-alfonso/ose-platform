"use client";
import { MenuNav } from "../MenuNav";
import type { ResolvedGroup } from "@/lib/menus";

// The admin's and teacher's menus. What's in them, in what order and which groups, is set in Admin → Menus.
export function AdminNav({ counts, groups }: { counts: Record<string, number>; groups: ResolvedGroup[] }) {
  return <MenuNav id="adm-nav" label="Admin" root="/admin" groups={groups} counts={counts} alias={{ "/admin/designs": "/admin/social" }} />; // More designs sits under Social
}
export function TeacherNav({ counts, groups }: { counts: Record<string, number>; groups: ResolvedGroup[] }) {
  return <MenuNav id="t-nav" label="Teacher" root="/admin/teacher" groups={groups} counts={counts} />;
}
