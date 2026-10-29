import { requireViewer } from "@/lib/auth";
import { getNotify } from "@/lib/notify";
import { NotifySettingsForm } from "../../../../NotifySettingsForm";

export const dynamic = "force-dynamic";
export default async function TeacherNotifications() {
  const me = await requireViewer();
  const s = await getNotify({ role: "teacher", id: me.id });
  return <><div className="top"><div><h1>Notifications</h1><div className="sub">Choose what you’re told about while My day is open, and a sound for each.</div></div></div>
    <NotifySettingsForm api="/admin/notify-api" role="teacher" initial={s} viewing={!!me.viewing} /></>;
}
