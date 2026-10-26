import { cookies } from "next/headers";
import { listSchools, siteSchool, SCHOOL_COOKIE } from "@/lib/db";

/** On the sign-in and set-up pages: says which school you're in when the School switcher has moved you away from this site's school. */
export async function SchoolNote() {
  const slug = (await cookies()).get(SCHOOL_COOKIE)?.value;
  if (!slug || slug === siteSchool()) return null;
  const all = await listSchools();
  const here = all.find((s) => s.slug === slug)?.name ?? slug, home = all.find((s) => s.slug === siteSchool())?.name ?? "OH-SO ED";
  return <p className="err">You’re in <b>{here}</b>, not {home}. <a href="/admin/school-reset">Back to {home}</a></p>;
}
