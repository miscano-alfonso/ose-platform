"use client";
import { MenuNav } from "../MenuNav";
import type { ResolvedGroup } from "@/lib/menus";

/** The parent's or student's menu, styled like the admin's; arranged in Admin → Menus. */
export function FamilyNav({ groups, counts, root }: { groups: ResolvedGroup[]; counts: Record<string, number>; root: string }) {
  return <MenuNav id="f-nav" label="Menu" root={root} groups={groups} counts={counts} />;
}
