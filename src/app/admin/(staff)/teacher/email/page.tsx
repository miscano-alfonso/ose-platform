import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
// 27 Nov (Alfonso: Email and Messages are confusing for teachers; one place): the teacher's emails with the school are back
// in Messages (with an envelope on each one that came by email). Old links (?school=…, ?to=…) open the same thing there.
export default async function TeacherEmail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && ["school", "to", "new", "ok", "err"].includes(k)) as [string, string][]).toString();
  redirect(`/admin/teacher/messages${keep ? `?${keep}` : ""}`);
}
