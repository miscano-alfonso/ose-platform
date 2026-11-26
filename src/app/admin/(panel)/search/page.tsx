import { requireStaff } from "@/lib/auth";
import { adminSearch } from "@/lib/search";
import { SearchResults } from "../../SearchResults";

export const dynamic = "force-dynamic";

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const q = ((await searchParams).q ?? "").slice(0, 80);
  return <SearchResults q={q} groups={await adminSearch(q, 40)} action="/admin/search" hint="Students, families, teachers, classes, workshops and dashboard pages. Ctrl/⌘ K searches from any page." />;
}
