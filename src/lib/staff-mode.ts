import "server-only";
import { cookies } from "next/headers";
import { withSchool } from "./db";

// 27 Nov: Admin mode / Teacher mode for an admin who also has a teacher profile (e.g. Leanne).
export const MODE_COOKIE = "ose_mode";

/** True when this staff account is also an (unarchived) teacher. */
export async function teachesSelf(userId: string): Promise<boolean> {
  return (await withSchool((q) => q<{ ok: boolean }>(`select exists (select 1 from teachers where user_id = $1 and archived_at is null) as ok`, [userId])).catch(() => [{ ok: false }]))[0]?.ok ?? false;
}
export async function staffMode(): Promise<"admin" | "teacher"> {
  return (await cookies()).get(MODE_COOKIE)?.value === "teacher" ? "teacher" : "admin";
}
