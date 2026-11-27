import { requireParent } from "@/lib/family-auth";
import { SettingsTabs } from "@/app/SettingsTabs";
import { getNotify } from "@/lib/notify";
import { NotifySettingsForm } from "../../../NotifySettingsForm";
import { Head } from "../../fmt";
import { TipsToggle } from "../../../TipsToggle";

export const dynamic = "force-dynamic";
export default async function ParentNotifications() {
  const f = await requireParent();
  const s = await getNotify({ role: "parent", id: f.id });
  return <><SettingsTabs area="parent" here="/parent/notifications" /><Head title="Notifications" sub="Choose what you’re told about while your dashboard is open, and a sound for each." /><TipsToggle />
    <NotifySettingsForm api="/parent/notify-api" role="parent" initial={s} viewing={!!f.viewer} /></>;
}
