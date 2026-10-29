import "server-only";
import { withSchool } from "./db";

// The wording of the stickers on course cards. The database picks which label a class gets (by its fixed name);
// what visitors read is set in Settings → Course labels (meet_kv course_label_words).
export const LABEL_KEYS = [
  { key: "few_spaces", name: "Few spaces left", hint: "A class with only a few places left" },
  { key: "almost_full", name: "Almost full", hint: "A class with one or two places left" },
  { key: "new_group", name: "New Group!", hint: "A class that has just opened" },
  { key: "launching_soon", name: "New Group Launching Soon!", hint: "A class still on its waiting list, opening soon (shown as \"Launching Soon!\" unless you change it)" },
] as const;
export type LabelWords = Record<(typeof LABEL_KEYS)[number]["key"], string>;
export const DEFAULT_WORDS: LabelWords = { few_spaces: "Few spaces left", almost_full: "Almost full", new_group: "New Group!", launching_soon: "Launching Soon!" };

export async function labelWords(): Promise<LabelWords> {
  const v = (await withSchool((q) => q<{ value: Partial<LabelWords> }>(`select value from meet_kv where key = 'course_label_words'`)).catch(() => []))[0]?.value ?? {};
  const out = { ...DEFAULT_WORDS };
  for (const { key } of LABEL_KEYS) if (typeof v[key] === "string" && v[key]!.trim()) out[key] = v[key]!.trim().slice(0, 40);
  return out;
}
export async function saveLabelWords(w: Partial<LabelWords>) {
  const clean: Partial<LabelWords> = {};
  for (const { key } of LABEL_KEYS) { const t = (w[key] ?? "").trim().slice(0, 40); if (t) clean[key] = t; }
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'course_label_words', $1)
    on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(clean)]));
}
/** Adds label_text (what visitors read) to each course; label stays the fixed name (used for the sticker colour). */
export async function withLabelText<T extends { label: string | null }>(rows: T[]): Promise<(T & { label_text: string | null })[]> {
  if (!rows.some((r) => r.label)) return rows.map((r) => ({ ...r, label_text: null }));
  const w = await labelWords();
  const byName = new Map<string, string>(LABEL_KEYS.map((k) => [k.name, w[k.key]]));
  return rows.map((r) => ({ ...r, label_text: r.label ? byName.get(r.label) ?? r.label : null }));
}
