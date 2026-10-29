import { requireStaff } from "@/lib/auth";
import { getNotify } from "@/lib/notify";
import { NotifySettingsForm } from "../../../NotifySettingsForm";

export const dynamic = "force-dynamic";
export default async function AdminNotifications() {
  const me = await requireStaff();
  const s = await getNotify({ role: "admin", id: me.id });
  return <><div className="top"><div><h1>Notifications</h1><div className="sub">Choose what you’re told about while the admin is open, and a sound for each.</div></div></div>
    <NotifySettingsForm api="/admin/notify-api" role="admin" initial={s} /></>;
}
