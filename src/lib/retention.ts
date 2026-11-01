import "server-only";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, DRIVE_URL } from "./meet";

// Year-end clear-out (1 Nov). The privacy notice says lesson chat records and lesson transcripts are deleted at the end of
// each academic year. Both live in the recordings account's (ose@) Google Drive: the Meet "Chat transcript" text files
// (archived as "… - Transcript" in the transcripts folder or the 1:1's folder) and, if Meet transcription is switched on,
// Meet's own spoken transcripts (Google Docs named "<meeting> (<date>) - Transcript").
// Once an academic year has ended, files of either kind made on or before its last day are moved to Drive's bin (Google
// empties the bin after 30 days, so there's a month to get one back). Starred files are kept: star a transcript in ose@'s
// Drive to keep it, e.g. when it's needed under the safeguarding policy. Off until an admin switches it on, after checking
// the list. Marks and reports in the database are not touched. Every file moved is listed in the log.
const DOC = "application/vnd.google-apps.document";
export type ClearFile = { id: string; name: string; created: string; kind: "chat" | "spoken" };
export type ClearLog = { at: string; by: string; cutoff: string; files: ClearFile[]; problems: string[] };
export type ClearState = { on: boolean; since?: string; by?: string; last?: { at: string; by: string; cutoff: string; count: number; problems: string[] } };

const isChat = (n: string) => /transcript/i.test(n);
const isSpoken = (n: string) => /\(\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[^)]*\)\s*[-–—]\s*Transcript\b/i.test(n);

/** The last day of the most recent academic year that has ended, or null if none has. */
export async function clearCutoff(): Promise<{ day: string; label: string } | null> {
  const r = await withSchool((q) => q<{ day: string; label: string }>(`select ends_on::text as day, label from academic_years where ends_on < current_date order by ends_on desc limit 1`));
  return r[0] ?? null;
}
/** When the clear-out next has something new to do: the day after the current academic year ends. */
export async function nextClear(): Promise<{ day: string; label: string } | null> {
  const r = await withSchool((q) => q<{ day: string; label: string }>(`select (ends_on + 1)::text as day, label from academic_years where ends_on >= current_date order by ends_on limit 1`));
  return r[0] ?? null;
}

export async function clearState(): Promise<ClearState> { return (await googleKv<ClearState>("year_clear")) ?? { on: false }; }
export async function clearLogs(): Promise<ClearLog[]> { return (await googleKv<ClearLog[]>("year_clear_log")) ?? []; }
export async function setClearOn(on: boolean, by: string) { const s = await clearState(); await googleKvSet("year_clear", { ...s, on, since: new Date().toISOString(), by }); }

async function list(token: string, q: string): Promise<{ id: string; name: string; mimeType: string; createdTime: string }[]> {
  const out: { id: string; name: string; mimeType: string; createdTime: string }[] = []; let page = "";
  for (let i = 0; i < 25; i++) {
    const u = new URL(DRIVE_URL() + "/files"); u.searchParams.set("q", q); u.searchParams.set("pageSize", "200");
    u.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,createdTime)"); u.searchParams.set("supportsAllDrives", "true"); u.searchParams.set("includeItemsFromAllDrives", "true");
    if (page) u.searchParams.set("pageToken", page);
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Google Drive answered ${r.status}`);
    const j = await r.json() as { files?: { id: string; name: string; mimeType: string; createdTime: string }[]; nextPageToken?: string };
    out.push(...(j.files ?? [])); if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  return out;
}

/** What the clear-out would move to the bin now (nothing until an academic year has ended). */
export async function clearPreview(): Promise<{ cutoff: { day: string; label: string } | null; files: ClearFile[]; error?: string }> {
  const cutoff = await clearCutoff().catch(() => null);
  if (!cutoff) return { cutoff, files: [] };
  try {
    const token = await googleAccess("rec");
    const before = `${cutoff.day}T23:59:59Z`;
    const base = `trashed = false and starred = false and 'me' in owners and createdTime <= '${before}' and name contains 'Transcript'`;
    const [chat, spoken] = await Promise.all([list(token, `${base} and mimeType = 'text/plain'`), list(token, `${base} and mimeType = '${DOC}'`)]);
    const files: ClearFile[] = [
      ...chat.filter((f) => isChat(f.name)).map((f) => ({ id: f.id, name: f.name, created: f.createdTime, kind: "chat" as const })),
      ...spoken.filter((f) => isSpoken(f.name)).map((f) => ({ id: f.id, name: f.name, created: f.createdTime, kind: "spoken" as const })),
    ].sort((a, b) => a.created.localeCompare(b.created));
    return { cutoff, files };
  } catch (e) { return { cutoff, files: [], error: (e as Error).message.slice(0, 160) }; }
}

/** Move them to the bin and log every file. Runs only when switched on (or `force` from the admin's "Clear now"). */
export async function runClear(by: string, force = false): Promise<{ moved: number; problems: string[]; skipped?: string }> {
  const st = await clearState();
  if (!st.on && !force) return { moved: 0, problems: [], skipped: "The year-end clear-out is switched off." };
  const p = await clearPreview();
  if (p.error) return { moved: 0, problems: [p.error] };
  if (!p.cutoff || !p.files.length) return { moved: 0, problems: [] };
  const token = await googleAccess("rec");
  const done: ClearFile[] = [], problems: string[] = [];
  for (const f of p.files.slice(0, 400)) {
    const r = await fetch(`${DRIVE_URL()}/files/${encodeURIComponent(f.id)}?supportsAllDrives=true`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ trashed: true }), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (r?.ok) done.push(f); else problems.push(`${f.name}: Google wouldn’t move it (${r?.status ?? "no answer"}).`);
  }
  const at = new Date().toISOString();
  if (done.length || problems.length) {
    const logs = await clearLogs();
    await googleKvSet("year_clear_log", [{ at, by, cutoff: p.cutoff.day, files: done, problems: problems.slice(0, 20) }, ...logs].slice(0, 20));
    await withSchool((q) => q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), null, 'delete', 'lesson_transcripts', null, $1)`,
      [JSON.stringify({ by, cutoff: p.cutoff!.day, moved: done.length, problems: problems.length })])).catch(() => null);
  }
  await googleKvSet("year_clear", { ...(await clearState()), last: { at, by, cutoff: p.cutoff.day, count: done.length, problems: problems.slice(0, 5) } });
  return { moved: done.length, problems };
}

/** With the other background jobs: at most once a day, and only when switched on. */
export async function clearBackground() {
  try {
    const st = await clearState(); if (!st.on) return;
    if (st.last && Date.now() - Date.parse(st.last.at) < 20 * 3600e3) return;
    const acct = await googleKv<{ refreshToken?: string }>("rec_google"); if (!acct?.refreshToken) return;
    await runClear("auto");
  } catch (e) { console.error("year-end clear-out", e); }
}
