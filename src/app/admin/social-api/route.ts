import { NextResponse, after, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import * as S from "@/lib/social";

// Admin → Social: one endpoint, like the Giles api.php?action=… handlers.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the AI searches take a minute or two

const out = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "cache-control": "no-store" } });
const origin = (req: NextRequest) => `${req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
const page = (title: string, text: string) => new NextResponse(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font:17px/1.5 Jost,Arial,sans-serif;background:#f3f4f8;color:#171b2b;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px">
<div style="background:#fff;border-radius:14px;padding:26px;max-width:480px"><h1 style="margin:0 0 8px;font-size:24px">${title}</h1><p style="margin:0 0 18px">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</p>
<a href="/admin/social" style="display:inline-block;background:#0f1747;color:#fff;border-radius:999px;padding:10px 18px;text-decoration:none">Back to Social</a></div></body></html>`, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });

async function guard(req: NextRequest, write: boolean) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return { me: null, res: out({ error: "Sign in to the admin again." }, 401) };
  if (write) {
    const o = req.headers.get("origin");
    if (o && o !== origin(req) && new URL(o).host !== req.headers.get("host")) return { me: null, res: out({ error: "Not allowed." }, 403) };
  }
  return { me, res: null };
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "";
  const base = await S.siteBase(origin(req));
  if (action === "metacallback") { // Facebook sends the browser back here
    const me = await currentStaff();
    if (!me || me.role !== "school_admin") return page("Sign in first", "Sign in to the admin, then press Connect again under Social.");
    const err = await S.metaCallback(base, req.nextUrl.searchParams);
    if (err) return page("Not connected", err);
    return NextResponse.redirect(`${base}/admin/social?social=connected`, 302);
  }
  const { me, res } = await guard(req, false); if (!me) return res!;
  try {
    switch (action) {
      case "metalogin": return NextResponse.redirect(await S.metaLoginUrl(base, me.email), 302);
      case "metaconfig": return out({ ...(await S.metaStatus(base)), ai: await S.aiStatus() });
      case "socialposts":
        await S.runDue(2).catch(() => false);
        if (req.nextUrl.searchParams.get("stats")) await S.refreshStats().catch(() => {});
        return out({ posts: await S.listPosts() });
      case "socialplan":
        after(() => S.socialBackground());
        return out({ plan: await S.listPlan(), template: await S.getTemplate(), moments: await S.momentsForClient(), handles: await S.getHandles(), ai: await S.aiReady() });
      default: return out({ error: "Unknown action." }, 404);
    }
  } catch (e) {
    if (e instanceof S.SocialError) return out({ error: e.message }, e.status);
    if (action === "metalogin") return page("Couldn’t connect", e instanceof Error ? e.message : "Try again.");
    console.error("social-api", action, e); return out({ error: "Something went wrong. Try again." }, 500);
  }
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "";
  const { me, res } = await guard(req, true); if (!me) return res!;
  const base = await S.siteBase(origin(req));
  try {
    if (action === "upload") {
      const f = (await req.formData()).get("file");
      if (!(f instanceof File)) return out({ error: "Choose a picture." }, 400);
      const id = await S.saveImage(Buffer.from(await f.arrayBuffer()));
      return out({ path: `/social-img/${id}.jpg` });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (action) {
      case "metaconfig": await S.metaConfigSave(b); return out({ ok: true });
      case "aiconfig": await S.aiSave(b); return out({ ok: true, ai: await S.aiStatus() });
      case "socialpost": return out(await S.createPost(b, me.email, base));
      case "socialcancel": return out({ post: await S.cancelPost(String(b.id ?? "")) });
      case "socialremove": await S.removePost(String(b.id ?? "")); return out({ ok: true });
      case "socialtplsave": return out({ template: await S.saveTemplate((b.template ?? {}) as Record<string, unknown>) });
      case "socialfind": return out({ suggestions: await S.findForItem(String(b.bookId ?? ""), String(b.kind ?? "")) });
      case "drawpicture": return out(await S.drawPicture(b));
      case "draftpost": return out(await S.draftPost(b));
      case "socialscan": return out(await S.scanNow(me.email));
      case "socialmomentsettings": return out(await S.momentSettings(b));
      case "socialmomenttest": await S.sendTestReport(me.email); return out({ ok: true, to: me.email });
      case "socialmomentdismiss": await S.dismissMoment(String(b.id ?? "")); return out({ ok: true });
      case "socialhandle": await S.saveHandle(String(b.partner ?? ""), String(b.handles ?? "")); return out({ ok: true });
      case "socialplansave": return out({ item: await S.savePlan(b, me.email) });
      case "socialplandelete": await S.deletePlan(String(b.id ?? "")); return out({ ok: true });
      default: return out({ error: "Unknown action." }, 404);
    }
  } catch (e) {
    if (e instanceof S.SocialError) return out({ error: e.message }, e.status);
    console.error("social-api", action, e); return out({ error: "Something went wrong. Try again." }, 500);
  }
}
