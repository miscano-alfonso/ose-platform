import { feedFor } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

// OH-SO ED Calendar: the private calendar address calendar apps read (no sign-in; the token is the key).
export async function GET(req: Request, { params }: { params: Promise<{ school: string; token: string }> }) {
  const { school, token } = await params;
  const body = await feedFor(school, token.replace(/\.ics$/, ""), new URL(req.url).origin);
  if (!body) return new Response("This calendar link isn’t valid any more. Get a new one from your OH-SO ED dashboard.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="ohsoed.ics"',
    "cache-control": "private, max-age=900", "x-robots-tag": "noindex" } });
}
