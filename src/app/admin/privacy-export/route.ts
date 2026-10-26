import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import { exportFamily } from "@/lib/privacy";

// Right of access / portability: everything held about one family, as a JSON download (the access is logged).
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return NextResponse.json({ error: "Sign in to the admin again." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("family") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "No family." }, { status: 400 });
  const data = await exportFamily(me.id, id);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="family-data-${id.slice(0, 8)}.json"`, "cache-control": "no-store" } });
}
