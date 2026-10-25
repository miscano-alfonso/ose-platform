import { requireStaff } from "@/lib/auth";
import { recipients } from "@/lib/email";

// The marketing list (people who agreed), as CSV for Brevo or elsewhere.
export async function GET() {
  await requireStaff();
  const list = await recipients("marketing");
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = "name,email\n" + list.map((r) => `${cell(r.name)},${cell(r.email)}`).join("\n") + "\n";
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ohsoed-marketing-list.csv"', "cache-control": "no-store" } });
}
