import { requireViewer } from "@/lib/auth";
import { teacherSearch } from "@/lib/search";
import { SearchResults } from "../../../SearchResults";

export const dynamic = "force-dynamic";

export default async function TeacherSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireViewer();
  const q = ((await searchParams).q ?? "").slice(0, 80);
  return <SearchResults q={q} groups={await teacherSearch(me.id, q, 60)} action="/admin/teacher/search" hint="Your students and classes, and your dashboard pages. Ctrl/⌘ K searches from any page." />;
}
