import { NextResponse, type NextRequest } from "next/server";
import { currentStaff } from "@/lib/auth";
import * as N from "@/lib/newsletter";
import { saveImage } from "@/lib/social";

// Admin → Newsletter, Subscribers and Email stats: one endpoint, like the Giles api.php?action=… handlers.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const out = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "cache-control": "no-store" } });

async function handle(req: NextRequest, post: boolean) {
  const me = await currentStaff();
  if (!me || me.role !== "school_admin") return out({ error: "Sign in to the admin again." }, 401);
  if (post) { const o = req.headers.get("origin"); if (o && new URL(o).host !== req.headers.get("host")) return out({ error: "Not allowed." }, 403); }
  const action = req.nextUrl.searchParams.get("action") || "";
  try {
    if (post && action === "upload") {
      const f = (await req.formData()).get("file");
      if (!(f instanceof File)) return out({ error: "Choose a picture." }, 400);
      return out({ path: `/social-img/${await saveImage(Buffer.from(await f.arrayBuffer()))}.jpg` });
    }
    const b = post ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    switch (action) {
      case "brevoconfig": if (post) { await N.brevoSave(b); return out({ ok: true }); } return out(await N.brevoStatus());
      case "brevosenders": return out({ senders: await N.brevoSenders() });
      case "brevosync": return out(await N.brevoSync());
      case "subscribers": return out({ subscribers: await N.listSubscribers() });
      case "subscriberadd": await N.addSubscriber(b, me.email); return out({ ok: true });
      case "subscriberset": await N.setSubscriber(String(b.email ?? ""), String(b.do ?? "")); return out({ ok: true });
      case "emails": return out({ emails: await N.listEmails() });
      case "emailget": return out({ email: await N.getEmail(String(b.id ?? "")) });
      case "emailsave": return out(await N.saveEmail((b.email ?? null) as Record<string, unknown>, me.email));
      case "emaildelete": await N.deleteEmail(String(b.id ?? "")); return out({ ok: true });
      case "emailtest": return out({ ok: true, to: await N.testSend(me.id, me.email, String(b.subject ?? "Email test"), String(b.html ?? ""), b.me !== false, b.extra) });
      case "emailsend": return out(await N.sendEmail(b, me.email));
      case "emailcancel": await N.cancelEmail(String(b.id ?? "")); return out({ ok: true });
      case "emailstats": return out(await N.emailStats());
      default: return out({ error: "Unknown action." }, 404);
    }
  } catch (e) {
    if (e instanceof N.NlError) return out({ error: e.message }, e.status);
    console.error("newsletter-api", action, e); return out({ error: "Something went wrong. Try again." }, 500);
  }
}
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
