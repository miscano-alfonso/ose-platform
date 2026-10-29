import { currentFamily } from "@/lib/family-auth";
import { notifyGet, notifyPost } from "@/lib/notify-http";

export const dynamic = "force-dynamic";
async function who() {
  const f = await currentFamily();
  return f && f.kind === "parent" ? { w: { role: "parent" as const, id: f.id }, save: !f.viewer } : { w: null, save: false };
}
export async function GET(req: Request) { return notifyGet(req, (await who()).w); }
export async function POST(req: Request) { const x = await who(); return notifyPost(req, x.w, x.save); }
