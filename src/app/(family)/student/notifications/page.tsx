import { requireStudent } from "@/lib/family-auth";
import { getNotify } from "@/lib/notify";
import { NotifySettingsForm } from "../../../NotifySettingsForm";
import { Head } from "../../fmt";

export const dynamic = "force-dynamic";
export default async function StudentNotifications() {
  const f = await requireStudent();
  const s = await getNotify({ role: "student", id: f.id });
  return <><Head title="Notifications" sub="Choose what you’re told about while your dashboard is open, and a sound for each." />
    <NotifySettingsForm api="/student/notify-api" role="student" initial={s} viewing={!!f.viewer} /></>;
}
