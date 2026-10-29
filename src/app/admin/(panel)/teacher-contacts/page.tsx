import { redirect } from "next/navigation";
// moved into Settings → Email
export default function TeacherContacts() { redirect("/admin/email-settings"); }
