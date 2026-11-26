import Link from "next/link";

/** 26 Nov (Alfonso): the teacher, parent and student menus no longer list Calendar sync, Google Drive and Notifications;
 *  a cog beside Sign out opens Settings, where they are tabs. */
export const SETTINGS_TABS: Record<"teacher" | "parent" | "student", [string, string][]> = {
  teacher: [["Notifications", "/admin/teacher/notifications"], ["Calendar sync", "/admin/teacher/calendar"], ["Google Drive", "/admin/teacher/drive"]],
  parent: [["Notifications", "/parent/notifications"], ["Calendar sync", "/parent/calendar"]],
  student: [["Notifications", "/student/notifications"], ["Calendar sync", "/student/calendar"]],
};
export const SETTINGS_HREFS = new Set(Object.values(SETTINGS_TABS).flat().map(([, h]) => h));

export function SettingsTabs({ area, here }: { area: keyof typeof SETTINGS_TABS; here: string }) {
  return <nav className="set-tabs" aria-label="Settings"><h1 className="set-title">Settings</h1>
    <div className="segl" role="tablist">{SETTINGS_TABS[area].map(([l, h]) => <Link key={h} href={h} role="tab" aria-selected={h === here} aria-current={h === here ? "page" : undefined}>{l}</Link>)}</div></nav>;
}
