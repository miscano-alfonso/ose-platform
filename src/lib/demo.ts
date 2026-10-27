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
    });
    return null;
  } catch (e) { console.error("demo reset", e); return "Couldn’t make the demo school: " + (e instanceof Error ? e.message : String(e)).slice(0, 200); }
}
