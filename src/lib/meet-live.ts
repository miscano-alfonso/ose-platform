import "server-only";
import { withSchool } from "./db";
import { googleAccess, recCanLive } from "./meet";

// Who is in a lesson's Google Meet right now (3 Nov). Meet's audit log only records someone when they leave the call, so
// during a lesson the register had nobody. The Google Meet API (read with the recordings account, ose@, which hosts the
// lessons) lists everyone in the call as it happens, including people still in it. Students are matched to the class by
// the name on their Google account. This is only for showing arrivals live: attendance itself still comes from the log.
const API = () => (process.env.MEET_API_URL || "https://meet.googleapis.com/v2").replace(/\/$/, "");
export type LiveParticipant = { name: string; joined: string; left: string | null };
export type LiveArrivals = { ok: true; participants: LiveParticipant[]; matched: Record<string, LiveParticipant>; calls: number; code: string } | { ok: false; reason: "none" | "reconnect" | "no_code" | "error"; message?: string };

const cache = new Map<string, { at: number; v: LiveArrivals }>();
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
/** "abc-defg-hij" from a Meet link. */
export const meetingCode = (url: string | null) => { const m = /meet\.google\.com\/([a-z]{3})-?([a-z]{4})-?([a-z]{3})/i.exec(url ?? ""); return m ? `${m[1]}-${m[2]}-${m[3]}`.toLowerCase() : null; };

async function get<T>(token: string, path: string): Promise<T> {
  const r = await fetch(API() + path, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) { const t = await r.text().catch(() => ""); let m = ""; try { m = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? ""; } catch { /* not JSON */ }
    throw new Error(`Google Meet answered ${r.status}${/SERVICE_DISABLED|has not been used/.test(t) ? " (turn on the Google Meet API in Google Cloud)" : m ? `: ${m.slice(0, 140)}` : ""}`); }
  return r.json() as Promise<T>;
}

/** Everyone in (or who has been in) the call for a lesson starting at `startIso`, matched to the class's students by name. */
export async function liveArrivals(key: string, meetUrl: string | null, startIso: string, students: { id: string; name: string; first: string }[]): Promise<LiveArrivals> {
  const hit = cache.get(key); if (hit && Date.now() - hit.at < 30e3) return hit.v;
  const code = meetingCode(meetUrl);
  const done = (v: LiveArrivals) => { cache.set(key, { at: Date.now(), v }); if (cache.size > 200) cache.clear(); return v; };
  if (!code) return done({ ok: false, reason: "no_code" });
  const can = await recCanLive().catch(() => "none" as const);
  if (can !== "ok") return done({ ok: false, reason: can });
  try {
    const token = await googleAccess("rec");
    const from = new Date(Date.parse(startIso) - 60 * 60e3).toISOString();
    const recs = await get<{ conferenceRecords?: { name: string; startTime: string; endTime?: string }[] }>(token,
      `/conferenceRecords?pageSize=10&filter=${encodeURIComponent(`space.meeting_code = "${code}" AND start_time >= "${from}"`)}`);
    const participants: LiveParticipant[] = [];
    for (const rec of (recs.conferenceRecords ?? []).slice(0, 4)) {
      let page = "";
      for (let i = 0; i < 5; i++) {
        const j = await get<{ participants?: { earliestStartTime?: string; latestEndTime?: string; signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string } }[]; nextPageToken?: string }>(token,
          `/${rec.name}/participants?pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
        for (const p of j.participants ?? []) {
          const name = p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? "";
          if (name && p.earliestStartTime) participants.push({ name, joined: p.earliestStartTime, left: p.latestEndTime ?? null });
        }
        if (!j.nextPageToken) break; page = j.nextPageToken;
      }
    }
    // one entry per name: their first join, and still in if any of their sessions is
    const byName = new Map<string, LiveParticipant>();
    for (const p of participants) { const k = norm(p.name), o = byName.get(k);
      byName.set(k, o ? { name: o.name, joined: o.joined < p.joined ? o.joined : p.joined, left: o.left === null || p.left === null ? null : (o.left > p.left ? o.left : p.left) } : p); }
    // match: the full name, else a first name only one student in the class has
    const matched: Record<string, LiveParticipant> = {};
    for (const s of students) {
      const full = byName.get(norm(s.name));
      const firsts = students.filter((x) => norm(x.first) === norm(s.first)).length === 1 ? [...byName.entries()].filter(([k]) => k.split(" ")[0] === norm(s.first)) : [];
      const m = full ?? (firsts.length === 1 ? firsts[0][1] : undefined);
      if (m) matched[s.id] = m;
    }
    return done({ ok: true, participants: [...byName.values()].sort((a, b) => a.joined.localeCompare(b.joined)), matched, calls: (recs.conferenceRecords ?? []).length, code });
  } catch (e) { return done({ ok: false, reason: "error", message: (e as Error).message.slice(0, 160) }); }
}

/** For the register: the students' first names, to match by. */
export async function studentFirsts(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const r = await withSchool((q) => q<{ id: string; first: string }>(`select id, coalesce(nullif(known_as, ''), first_name) as first from students where id = any($1::uuid[])`, [ids])).catch(() => []);
  return new Map(r.map((x) => [x.id, x.first]));
}
