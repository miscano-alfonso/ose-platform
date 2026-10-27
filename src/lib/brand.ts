import "server-only";
import { cache } from "react";
import { withSchool } from "./db";

// Logo and browser-tab icon (Admin → Website). Not set → the built-in files.
export type BrandKind = "logo" | "icon";
export const DEFAULT_SRC: Record<BrandKind, string> = { logo: "/ose-logo.png", icon: "/ose-icon.svg" };
export const BRAND_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Image URLs for the page, with a version so a new upload shows straight away. */
export const brandSrc = cache(async (): Promise<Record<BrandKind, string> & { custom: Record<BrandKind, boolean> }> => {
  try {
    const rows = await withSchool((q) => q<{ kind: BrandKind; v: string }>(`select kind, extract(epoch from updated_at)::bigint::text as v from brand_assets`));
    const v = Object.fromEntries(rows.map((r) => [r.kind, r.v])) as Partial<Record<BrandKind, string>>;
    // the made-up demo school has its own built-in logo, never OH-SO ED's
    const demo = !v.logo && (await withSchool((q) => q<{ d: boolean }>(`select is_demo as d from schools where id = current_school()`)))[0]?.d;
    return {
      logo: v.logo ? `/brand/logo?v=${v.logo}` : demo ? "/osedtech/demo-academy-logo.svg" : DEFAULT_SRC.logo,
      icon: v.icon ? `/brand/icon?v=${v.icon}` : demo ? "/osedtech/demo-academy-icon.svg" : DEFAULT_SRC.icon,
      custom: { logo: !!v.logo, icon: !!v.icon },
    };
  } catch { return { ...DEFAULT_SRC, custom: { logo: false, icon: false } }; }
});

export async function getBrandAsset(kind: BrandKind) {
  const r = await withSchool((q) => q<{ mime: string; data: Buffer }>(`select mime, data from brand_assets where kind = $1`, [kind]));
  return r[0] ?? null;
}

export async function saveBrandAsset(actor: string, kind: BrandKind, file: { mime: string; data: Buffer } | null) {
  await withSchool(async (q) => {
    if (file) await q(`insert into brand_assets (school_id, kind, mime, data, updated_by) values (current_school(), $1, $2, $3, $4)
      on conflict (school_id, kind) do update set mime = excluded.mime, data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [kind, file.mime, file.data, actor]);
    else await q(`delete from brand_assets where kind = $1`, [kind]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, detail) values (current_school(), $1, $2, 'brand', $3)`, [actor, file ? "update" : "reset", JSON.stringify({ kind })]);
  });
}

/** Checks the file really is the image type it claims (by its first bytes). */
export function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  const head = buf.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}
