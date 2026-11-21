import { requireStudent } from "@/lib/family-auth";
import { withSchool } from "@/lib/db";
import { ResourcesView } from "../../ResourcesView";

// Student → Resources (21 Nov): resources for the student's own subjects, then "Other subjects".
export default async function StudentResources({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireStudent()]);
  const courses = await withSchool((q) => q<{ subject: string; level: string }>(`select sj.name as subject, l.name as level from enrolments x join course_groups g on g.id = x.group_id
    join subjects sj on sj.id = g.subject_id join levels l on l.id = g.level_id where x.student_id = $1 and x.status = 'active' and not x.is_taster order by l.sort_order, sj.name`, [f.id]));
  return <ResourcesView base="/student/resources" tab={sp.tab} courses={courses} forParent={false} />;
}
