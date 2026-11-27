import { requireStudent } from "@/lib/family-auth";
import { SettingsTabs } from "@/app/SettingsTabs";
import { getNotify } from "@/lib/notify";
import { NotifySettingsForm } from "../../../NotifySettingsForm";
import { Head } from "../../fmt";
import { TipsToggle } from "../../../TipsToggle";

export const dynamic = "force-dynamic";
export default async function StudentNotifications() {
  const f = await requireStudent();
  const s = await getNotify({ role: "student", id: f.id });
  return <><SettingsTabs area="student" here="/student/notifications" /><Head title="Notifications" sub="Choose what you’re told about while your dashboard is open, and a sound for each." /><TipsToggle />
    <NotifySettingsForm api="/student/notify-api" role="student" initial={s} viewing={!!f.viewer} /></>;
}
