import "server-only";
import { withSchool, runAsSchool, siteSchool } from "./db";
import { ensureLessonDates } from "./ops";
import { buildSchedules } from "./payments";
import type { Staff } from "./auth";

// The demo school ("Demo Academy"): OH-SO ED's course set-up with made-up families, for showing the system to people.
// Making it again wipes everything in it (it only ever holds invented data) and builds it fresh.
export const DEMO = "demo-academy";
export async function resetDemo(me: Staff): Promise<string | null> {
  try {
    await withSchool((q) => q(`select reset_demo_school($1)`, [siteSchool()]));
    await runAsSchool(DEMO, async () => {
      await withSchool((q) => q(`insert into users (school_id, email, name, role) values (current_school(), $1, $2, 'school_admin')`, [me.email, me.name]));
      await ensureLessonDates();
      const [u] = await withSchool((q) => q<{ id: string }>(`select id from users where lower(email::text) = lower($1)`, [me.email]));
      await buildSchedules(u.id);
      await withSchool((q) => q(`select demo_activity()`));
      await withSchool((q) => q(`select demo_comms()`)).catch((e) => console.error("demo comms", e));
      await withSchool((q) => q(`select demo_tutoring()`)).catch((e) => console.error("demo 1:1s", e));   // past and upcoming 1:1 lessons
      await withSchool((q) => q(`select demo_send()`)).catch((e) => console.error("demo SEND", e));        // SEND details and birthdays coming up
    });
    return null;
  } catch (e) { console.error("demo reset", e); return "Couldn’t make the demo school: " + (e instanceof Error ? e.message : String(e)).slice(0, 200); }
}

/** /osedtech/demo: opens the demo school for a visitor. The demo is made fresh when it's more than a day old (or missing). */
export async function startPublicDemo(): Promise<string | null> {
  const { DEMO_VISITOR, startVisitorSession } = await import("./auth");
  const { createHmac } = await import("node:crypto");
  const { cookies } = await import("next/headers");
  const { SCHOOL_COOKIE } = await import("./db");
  const age = await runAsSchool(DEMO, () => withSchool((q) => q<{ h: number }>(`select extract(epoch from now() - (value->>'at')::timestamptz) / 3600 as h from meet_kv where school_id = current_school() and key = 'demo_reset'`)))
    .then((r) => r[0]?.h ?? 999).catch(() => 999);
  if (age > 24) {
    const err = await resetDemo({ email: DEMO_VISITOR.email, name: DEMO_VISITOR.name } as Staff);
    if (err) return "The demo couldn’t be prepared just now. Please try again in a minute.";
    await runAsSchool(DEMO, () => withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'demo_reset', jsonb_build_object('at', now()))
      on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`))).catch(() => undefined);
  }
  const ok = await runAsSchool(DEMO, () => startVisitorSession());
  if (!ok) return "The demo isn’t available just now.";
  const jar = await cookies(), secure = process.env.NODE_ENV === "production";
  jar.set(SCHOOL_COOKIE, DEMO, { httpOnly: true, secure, sameSite: "lax", path: "/admin", maxAge: 4 * 3600 });
  await setDemoCookie(createHmac);
  return null;
}
/** The signed cookie that lets demo visitors past the private-preview password (checked in middleware). */
async function setDemoCookie(createHmac: typeof import("node:crypto").createHmac) {
  const key = process.env.SITE_PASSWORD || process.env.ADMIN_SETUP_KEY || ""; if (!key) return;
  const { cookies } = await import("next/headers");
  (await cookies()).set("ose_demo", createHmac("sha256", key).update("ose-demo").digest("base64url"), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 4 * 3600 });
}
/** /osedtech/demo/site: shows the demo school's public website (the course shop) to this browser for 4 hours. */
export async function openDemoSite(): Promise<string | null> {
  const { createHmac } = await import("node:crypto");
  const { cookies } = await import("next/headers");
  if (!(process.env.SITE_PASSWORD || process.env.ADMIN_SETUP_KEY)) return "The demo website isn’t set up on this server.";
  const age = await runAsSchool(DEMO, () => withSchool((q) => q<{ h: number }>(`select extract(epoch from now() - (value->>'at')::timestamptz) / 3600 as h from meet_kv where school_id = current_school() and key = 'demo_reset'`)))
    .then((r) => r[0]?.h ?? 999).catch(() => 999);
  if (age > 24) { const e = await startPublicDemo(); if (e) return e; }
  await setDemoCookie(createHmac);
  (await cookies()).set("ose_site", DEMO, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 4 * 3600 });
  return null;
}
/** Leaving the demo: this browser sees the real site again. */
export async function leaveDemo() {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.delete({ name: "ose_site", path: "/" }); jar.delete({ name: "ose_demo", path: "/" });
}
