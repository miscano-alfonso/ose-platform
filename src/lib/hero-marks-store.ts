import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { runAsSchool, siteSchool, withSchool } from "./db";
import { HOME_DEFAULT, SYMBOLS, type Mark } from "@/app/(site)/hero-marks";

// The home page hero's floating symbols: where each sits, which symbol and how big. Arranged on the home page itself by an
// OH-SO ED admin (Admin → Website → Home page symbols sets a signed "ose_hero" cookie for 4 hours, then opens "/").
const KEY = "hero_marks", COOKIE = "ose_hero", HOURS = 4;
const secret = () => process.env.ADMIN_SETUP_KEY || process.env.SITE_PASSWORD || process.env.DATABASE_URL || "ose-hero";
const sign = (s: string) => createHmac("sha256", secret()).update(`ose-hero:${s}`).digest("base64url");

export const heroMarks = cache(async (): Promise<Mark[]> => {
  const v = await runAsSchool(siteSchool(), () => withSchool((q) => q<{ value: Mark[] }>(`select value from meet_kv where key = $1`, [KEY]))).then((r) => r[0]?.value).catch(() => null);
  return Array.isArray(v) ? clean(v) : HOME_DEFAULT;
});
export function clean(v: unknown): Mark[] {
  const n = (x: unknown, lo: number, hi: number, d: number) => { const f = Number(x); return Number.isFinite(f) ? Math.round(Math.min(hi, Math.max(lo, f)) * 10) / 10 : d; };
  return (Array.isArray(v) ? v : []).slice(0, 60).filter((m) => m && SYMBOLS[(m as Mark).k])
    .map((m) => ({ k: (m as Mark).k, x: n((m as Mark).x, -5, 105, 50), y: n((m as Mark).y, -5, 105, 50), s: n((m as Mark).s, .4, 2.5, 1) }));
}
export async function saveHeroMarks(list: Mark[] | null) {
  await runAsSchool(siteSchool(), () => withSchool((q) => list == null ? q(`delete from meet_kv where key = $1`, [KEY])
    : q(`insert into meet_kv (school_id, key, value) values (current_school(), $1, $2) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [KEY, JSON.stringify(clean(list))])));
}

export async function startArranging(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600, body = `${userId}.${exp}`;
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: HOURS * 3600 });
}
export async function stopArranging() { (await cookies()).delete({ name: COOKIE, path: "/" }); }
/** The admin arranging the symbols (signed cookie, still an admin of OH-SO ED), or null. */
export const arranger = cache(async (): Promise<{ id: string; name: string } | null> => {
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([\w-]{40,50})$/.exec(v); if (!m) return null;
  const a = Buffer.from(m[3]), b = Buffer.from(sign(`${m[1]}.${m[2]}`));
  if (a.length !== b.length || !timingSafeEqual(a, b) || Number(m[2]) * 1000 < Date.now()) return null;
  const u = await runAsSchool(siteSchool(), () => withSchool((q) => q<{ id: string; name: string }>(`select id, name from users where id = $1 and role = 'school_admin' and disabled_at is null`, [m[1]]))).catch(() => []);
  return u[0] ?? null;
});
