import type { Metadata } from "next";
import { requireStudent } from "@/lib/family-auth";
import { withSchool } from "@/lib/db";
import { Shell } from "../Shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My classes", robots: { index: false, follow: false } };

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const f = await requireStudent();
  const classes = await withSchool((q) => q<{ id: string; subject: string }>(`select g.id, sj.name as subject from enrolments x join course_groups g on g.id = x.group_id join subjects sj on sj.id = g.subject_id
    join levels l on l.id = g.level_id where x.student_id = $1 and x.status = 'active' and not x.is_taster order by l.sort_order, sj.name`, [f.id]));
  return <Shell f={f} root="/student" items={[["Home", "/student", "home"], ...classes.map((c) => [c.subject, `/student/class/${c.id}`, "cls"] as [string, string, string]),
    ["Chat", "/student/chat", "chat"], ["Rewards", "/student/rewards", "star"]]}>{children}</Shell>;
}
