import "server-only";
import { withSchool, runAsSchool, siteSchool } from "./db";
import { ensureLessonDates } from "./ops";
import { buildSchedules } from "./payments";
import type { Staff } from "./auth";

// The demo school ("Demo Academy"): OH-SO ED's course set-up with made-up families, for showing the system to people.
// Making it again wipes everything in it (it only ever holds invented data) and builds it fresh.
export const DEMO = "demo-academy";
/** 28 Nov: the Solo-plan demo school (Bright Maths Tuition): one person runs it and teaches every class. */
export const SOLO_DEMO = "demo-solo";
export const DEMO_SLUGS = [DEMO, SOLO_DEMO];
export type DemoKind = "academy" | "solo";
const slugOf = (k: DemoKind) => (k === "solo" ? SOLO_DEMO : DEMO);

/** Makes the Solo demo school again: OH-SO ED's set-up, Maths classes only, a dozen made-up families, and the demo
 *  visitor as its owner and only teacher. The Demo Academy helpers then add attendance, payments, reports and messages. */
export async function resetSoloDemo(visitorEmail: string): Promise<string | null> {
  try {
    await withSchool((q) => q(`select reset_solo_demo($1, $2)`, [siteSchool(), visitorEmail]));
    await runAsSchool(SOLO_DEMO, async () => {
      await ensureLessonDates();
      const [u] = await withSchool((q) => q<{ id: string }>(`select id from users where lower(email::text) = lower($1)`, [visitorEmail]));
      await buildSchedules(u.id);
      // the helpers act on the school named here, in this transaction only
      await demoTasterAutomations();
      for (const f of ["demo_activity", "demo_comms", "demo_threads", "demo_tutoring", "demo_send", "demo_genders", "demo_marking", "demo_taster_journeys"])
        await withSchool(async (q) => { await q(`select set_config('ose.demo_slug', $1, true)`, [SOLO_DEMO]); await q(`select ${f}()`); }).catch((e) => console.error("solo demo", f, e));
    });
    return null;
  } catch (e) { console.error("solo demo reset", e); return "Couldn’t make the Solo demo: " + (e instanceof Error ? e.message : String(e)).slice(0, 200); }
}
/** The taster emails switched on (with their standard wording), so the demo's taster journeys show them going out. */
async function demoTasterAutomations() {
  const { DEFS } = await import("./automations");
  await withSchool(async (q) => { for (const d of DEFS.filter((x) => x.key.startsWith("taster")))
    await q(`insert into automations (school_id, key, enabled, subject, body, minutes, to_parent, to_student) values (current_school(), $1, true, $2, $3, $4, $5, $6)
      on conflict (school_id, key) do update set enabled = true`, [d.key, d.subject, d.body, d.timing?.default ?? null, d.to_parent, d.to_student]); });
}
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
      await withSchool((q) => q(`select demo_threads()`)).catch((e) => console.error("demo threads", e));   // class chats as threads with replies
      await withSchool((q) => q(`select demo_contacts()`)).catch((e) => console.error("demo contacts", e)); // the Principal and IT Support teachers message
      await withSchool((q) => q(`select demo_tutoring()`)).catch((e) => console.error("demo 1:1s", e));   // past and upcoming 1:1 lessons
      await withSchool((q) => q(`select demo_send()`)).catch((e) => console.error("demo SEND", e));
      await withSchool((q) => q(`select demo_genders()`)).catch((e) => console.error("demo genders", e));
      await withSchool((q) => q(`select demo_marking()`)).catch((e) => console.error("demo marking", e));
      await demoTasterAutomations().catch((e) => console.error("demo taster automations", e));   // 28 Nov: the taster emails are on in the demo
      await withSchool((q) => q(`select demo_taster_journeys()`)).catch((e) => console.error("demo taster journeys", e));   // tasters at every stage   // 27 Nov: work waiting to be marked   // so report drafts use he/she/they        // SEND details and birthdays coming up
    });
    return null;
  } catch (e) { console.error("demo reset", e); return "Couldn’t make the demo school: " + (e instanceof Error ? e.message : String(e)).slice(0, 200); }
}

/** /osedtech/demo: opens the demo school for a visitor. The demo is made fresh when it's more than a day old (or missing). */
export async function startPublicDemo(kind: DemoKind = "academy"): Promise<string | null> {
  const { DEMO_VISITOR, startVisitorSession } = await import("./auth");
  const { createHmac } = await import("node:crypto");
  const { cookies } = await import("next/headers");
  const { SCHOOL_COOKIE } = await import("./db");
  const slug = slugOf(kind);
  const age = await runAsSchool(slug, () => withSchool((q) => q<{ h: number }>(`select extract(epoch from now() - (value->>'at')::timestamptz) / 3600 as h from meet_kv where school_id = current_school() and key = 'demo_reset'`)
    .then((r) => r[0]?.h ?? 999))).catch(() => 999);
  if (age > 24) {
    const err = kind === "solo" ? await resetSoloDemo(DEMO_VISITOR.email) : await resetDemo({ email: DEMO_VISITOR.email, name: DEMO_VISITOR.name } as Staff);
    if (err) return "The demo couldn’t be prepared just now. Please try again in a minute.";
    await runAsSchool(slug, () => withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'demo_reset', jsonb_build_object('at', now()))
      on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`))).catch(() => undefined);
  }
  const ok = await runAsSchool(slug, () => startVisitorSession());
  if (!ok) return "The demo isn’t available just now.";
  const jar = await cookies(), secure = process.env.NODE_ENV === "production";
  jar.set(SCHOOL_COOKIE, slug, { httpOnly: true, secure, sameSite: "lax", path: "/admin", maxAge: 4 * 3600 });
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
export async function openDemoSite(kind: DemoKind = "academy"): Promise<string | null> {
  const { createHmac } = await import("node:crypto");
  const { cookies } = await import("next/headers");
  if (!(process.env.SITE_PASSWORD || process.env.ADMIN_SETUP_KEY)) return "The demo website isn’t set up on this server.";
  const slug = slugOf(kind);
  const age = await runAsSchool(slug, () => withSchool((q) => q<{ h: number }>(`select extract(epoch from now() - (value->>'at')::timestamptz) / 3600 as h from meet_kv where school_id = current_school() and key = 'demo_reset'`)
    .then((r) => r[0]?.h ?? 999))).catch(() => 999);
  if (age > 24) { const e = await startPublicDemo(kind); if (e) return e; }
  await setDemoCookie(createHmac);
  (await cookies()).set("ose_site", slug, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 4 * 3600 });
  return null;
}
/** Leaving the demo: this browser sees the real site again. */
export async function leaveDemo() {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.delete({ name: "ose_site", path: "/" }); jar.delete({ name: "ose_demo", path: "/" });
}
