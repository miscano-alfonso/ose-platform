import { requireParent } from "@/lib/family-auth";
import { kids } from "@/lib/family";
import { ResourcesView } from "../../ResourcesView";

// Parent → Resources (21 Nov): resources for the subjects the children are booked on, then "Other subjects".
export default async function ParentResources({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const children = await kids(f.id);
  const several = children.filter((k) => k.classes.length).length > 1;
  const courses = children.flatMap((k) => k.classes.map((c) => ({ subject: c.subject, level: c.level, who: several ? k.first : undefined })));
  return <ResourcesView base="/parent/resources" tab={sp.tab} courses={courses} forParent familyId={f.parentId || f.id} viewer={!!f.viewer} />;
}
