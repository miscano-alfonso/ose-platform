import { redirect } from "next/navigation";

// Teachers' Email is now part of Messages (31 Oct): old links (and notifications) land there.
export default async function TeacherEmail({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const to = (await searchParams).to;
  redirect(to && /^[0-9a-f-]{36}$/.test(to) ? `/admin/teacher/messages?to=${to}` : "/admin/teacher/messages");
}
