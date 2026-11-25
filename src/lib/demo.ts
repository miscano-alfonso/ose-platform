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
      await withSchool((q) => q(`select demo_threads()`)).catch((e) => console.error("demo threads", e));   // class chats as threads with replies
      await withSchool((q) => q(`select demo_contacts()`)).catch((e) => console.error("demo contacts", e)); // the Principal and IT Support teachers message
      await withSchool((q) => q(`select demo_tutoring()`)).catch((e) => console.error("demo 1:1s", e));   // past and upcoming 1:1 lessons
      await withSchool((q) => q(`select demo_send()`)).catch((e) => console.error("demo SEND", e));
      await withSchool((q) => q(`select demo_genders()`)).catch((e) => console.error("demo genders", e));   // so report drafts use he/she/they        // SEND details and birthdays coming up
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

/** /newdashboard/<role>/demo (25 Nov): opens Demo Academy straight into a made-up teacher's, parent's or student's dashboard,
 *  read-only (the demo visitor "Viewing as" them). The teacher with the most classes; a parent with two or more children
 *  in classes; the student with the most classes. */
export type DemoRole = "teacher" | "parent" | "student";
export const NEWDASH_COOKIE = "ose_nd";   // set while someone looks round from /newdashboard: the demo dashboards show "Leave the demo"
export async function openDemoAs(role: DemoRole): Promise<{ to: string } | { error: string }> {
  const err = await startPublicDemo();
  if (err) return { error: err };
  const { cookies } = await import("next/headers");
  (await cookies()).set(NEWDASH_COOKIE, role, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 4 * 3600 });
  const { VIEWAS_COOKIE, DEMO_VISITOR } = await import("./auth");
  const { viewAsFamily } = await import("./family-auth");
  return runAsSchool(DEMO, async () => {
    const pick = (sql: string) => withSchool((q) => q<{ id: string }>(sql)).then((r) => r[0]?.id ?? null);
    if (role === "teacher") {
      const id = await pick(`select u.id from users u join teachers t on t.user_id = u.id
        where u.disabled_at is null and t.archived_at is null and u.role = 'teacher'
        order by (select count(*) from course_groups g where g.teacher_id = t.id and g.status <> 'hidden') desc, u.name limit 1`);
      if (!id) return { error: "The demo school has no teachers just now. Please try again in a minute." };
      (await cookies()).set(VIEWAS_COOKIE, `t:${id}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: 4 * 3600 });
      return { to: "/admin/teacher" };
    }
    const visitor = await pick(`select id from users where lower(email::text) = '${DEMO_VISITOR.email}'`);
    const id = role === "parent"
      ? await pick(`select p.id from parents p join students s on s.parent_id = p.id join enrolments e on e.student_id = s.id and e.status = 'active' and not e.is_taster
          group by p.id order by count(distinct s.id) >= 2 desc, count(*) desc, p.id limit 1`)
      : await pick(`select s.id from students s join enrolments e on e.student_id = s.id and e.status = 'active' and not e.is_taster
          group by s.id order by count(*) desc, s.id limit 1`);
    if (!visitor || !id) return { error: "The demo school isn’t ready just now. Please try again in a minute." };
    await viewAsFamily(visitor, role === "parent" ? "p" : "s", id);
    return { to: role === "parent" ? "/parent" : "/student" };
  });
}

/** Leaving a /newdashboard demo: back to this browser's own school. A teacher's or admin's own sign-in is untouched (each school
 *  has its own session cookie); a parent's or student's was replaced by the demo's, so they sign in again. */
export async function leaveNewDashDemo() {
  const { cookies } = await import("next/headers");
  const { SCHOOL_COOKIE } = await import("./db");
  const { VIEWAS_COOKIE } = await import("./auth");
  const { familySignOut, currentFamily } = await import("./family-auth");
  const jar = await cookies();
  // (the /admin, /parent and /student cookies aren't sent to /newdashboard, so they're cleared without reading them)
  await runAsSchool(DEMO, async () => { if ((await currentFamily())?.viewer) await familySignOut(); });
  await runAsSchool(DEMO, async () => { const { signOut } = await import("./auth"); await signOut(); });
  jar.delete({ name: SCHOOL_COOKIE, path: "/admin" });
  jar.delete({ name: SCHOOL_COOKIE + "_p", path: "/parent" }); jar.delete({ name: SCHOOL_COOKIE + "_s", path: "/student" });
  jar.delete({ name: VIEWAS_COOKIE, path: "/admin" });
  jar.delete({ name: NEWDASH_COOKIE, path: "/" }); jar.delete({ name: "ose_demo", path: "/" }); jar.delete({ name: "ose_site", path: "/" });
}
