import { requireParent } from "@/lib/family-auth";
import { getNotify } from "@/lib/notify";
import { NotifySettingsForm } from "../../../NotifySettingsForm";
import { Head } from "../../fmt";

export const dynamic = "force-dynamic";
export default async function ParentNotifications() {
  const f = await requireParent();
  const s = await getNotify({ role: "parent", id: f.id });
  return <><Head title="Notifications" sub="Choose what you’re told about while your dashboard is open, and a sound for each." />
    <NotifySettingsForm api="/parent/notify-api" role="parent" initial={s} viewing={!!f.viewer} /></>;
}
