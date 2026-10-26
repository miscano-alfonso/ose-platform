import "server-only";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, GMAIL_URL, MeetError, type Mailbox } from "./meet";

// Admin → Email → Inbox, as in the prototype: replies and emails from families, read (read-only) from the school's Gmail inbox
// and linked to the family. Only senders the school already knows are kept; everything else stays in Gmail only.
export type InboxInfo = { at?: string; added?: number; error?: string; last?: string };
export type InboxRow = { id: string; thread_id: string; from_name: string | null; from_email: string; subject: string; snippet: string; received_at: string;
  parent_id: string | null; family: string | null; kind: string; read: boolean };

export async function inboxStatus() {
  const [m, info] = await Promise.all([googleKv<Mailbox>("gmail"), googleKv<InboxInfo>("inbox")]);
  return { connected: !!m?.refreshToken, mailbox: m?.mailbox ?? "", by: m?.by ?? "", info: info ?? {} };
}
export async function disconnectInbox() { await googleKvSet("gmail", null); }

export async function inboxList(show: "new" | "all"): Promise<{ rows: InboxRow[]; unread: number }> {
  return withSchool(async (q) => ({
    rows: await q<InboxRow>(`select m.id, m.thread_id, m.from_name, m.from_email::text, m.subject, m.snippet, m.received_at::text, m.parent_id,
        p.first_name || ' ' || p.last_name as family, m.kind, m.read_at is not null as read
      from inbox_messages m left join parents p on p.id = m.parent_id where ($1 = 'all' or m.read_at is null) order by m.received_at desc limit 200`, [show]),
    unread: (await q<{ n: number }>(`select count(*)::int as n from inbox_messages where read_at is null`))[0].n,
  }));
}
export async function unreadInbox(): Promise<number> {
  return withSchool(async (q) => (await q<{ n: number }>(`select count(*)::int as n from inbox_messages where read_at is null`))[0].n).catch(() => 0);
}
export async function markInbox(actorId: string, ids: string[] | "all", read: boolean) {
  await withSchool((q) => ids === "all"
    ? q(`update inbox_messages set read_at = now(), read_by = $1 where read_at is null`, [actorId])
    : q(`update inbox_messages set read_at = ${read ? "now()" : "null"}, read_by = ${read ? "$1" : "null"} where id = any($2::uuid[])`, [actorId, ids]));
}

const fromOf = (v: string) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v); return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: v.trim().toLowerCase() }; };

export async function syncInbox(): Promise<InboxInfo> {
  let token: string;
  try { token = await googleAccess("gmail"); }
  catch (e) { const info = { at: new Date().toISOString(), last: ((await googleKv<InboxInfo>("inbox")) ?? {}).last, error: e instanceof MeetError ? e.message : "Couldn’t reach Gmail." }; await googleKvSet("inbox", info); return info; }
  const prev = (await googleKv<InboxInfo>("inbox")) ?? {};
  const seen = new Set((await googleKv<string[]>("inbox_seen")) ?? []);
  const days = prev.last ? Math.min(30, Math.max(2, Math.ceil((Date.now() - Date.parse(prev.last)) / 86400e3) + 1)) : 30;   // since the last good read
  const ids: { id: string }[] = []; let pageToken = "";
  for (let i = 0; i < 4; i++) {
    const u = new URL(`${GMAIL_URL()}/users/me/messages`); u.searchParams.set("q", `in:inbox newer_than:${days}d -from:me`); u.searchParams.set("maxResults", "100");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { const info = { at: new Date().toISOString(), last: prev.last, error: r.status === 403 ? "Gmail said no: turn on the Gmail API in Google Cloud Console, then reconnect the inbox." : `Gmail answered ${r.status}.` }; await googleKvSet("inbox", info); return info; }
    const j = (await r.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(j.messages ?? [])); if (!j.nextPageToken) break; pageToken = j.nextPageToken;
  }
  let added = 0;
  await withSchool(async (q) => {
    const have = new Set((await q<{ g: string }>(`select gmail_id as g from inbox_messages where gmail_id = any($1::text[])`, [ids.map((x) => x.id)])).map((x) => x.g));
    for (const { id } of ids) {
      if (have.has(id) || seen.has(id)) continue;
      const r = await fetch(`${GMAIL_URL()}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const m = (await r.json()) as { threadId: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
      const h = Object.fromEntries((m.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
      const from = fromOf(h.from ?? "");
      seen.add(id);
      if (!/@/.test(from.email)) continue;
      // who is it? a family first, then someone who enquired, is waiting, or booked a taster
      const [who] = await q<{ parent_id: string | null; kind: string }>(`
        select p.id as parent_id, 'family' as kind, 1 as o from parents p where p.email = $1
        union all select g.parent_id, 'family', 2 from guardians g where g.email = $1
        union all select r.parent_id, 'taster', 3 from taster_requests r where r.parent_email = $1
        union all select null, 'waiting', 4 from waitlist_entries w where w.email = $1
        union all select null, 'enquiry', 5 from enquiries e where e.email = $1
        order by o limit 1`, [from.email]);
      if (!who) continue;
      const ins = await q(`insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, received_at, parent_id, kind)
        values (current_school(), $1, $2, $3, $4, $5, $6, to_timestamp($7::bigint / 1000.0), $8, $9) on conflict (school_id, gmail_id) do nothing returning id`,
        [id, m.threadId, from.name?.slice(0, 120) ?? null, from.email, (h.subject ?? "").slice(0, 300), decode(m.snippet ?? "").slice(0, 400), m.internalDate ?? String(Date.now()), who.parent_id, who.kind]);
      added += ins.length;
    }
    // kept for a year; nothing kept for a family whose data was erased
    await q(`delete from inbox_messages where received_at < now() - interval '12 months' or parent_id in (select id from parents where email::text like 'erased-%')`);
  });
  await googleKvSet("inbox_seen", [...seen].slice(-800));
  const info = { at: new Date().toISOString(), added, last: new Date().toISOString() };
  await googleKvSet("inbox", info);
  return info;
}
const decode = (s: string) => s.replace(/&#39;/g, "’").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** With the other background jobs: at most every 15 minutes while the admin is open. */
export async function inboxBackground() {
  try {
    const s = await inboxStatus(); if (!s.connected) return;
    if (s.info.at && Date.now() - Date.parse(s.info.at) < 15 * 60e3) return;
    await googleKvSet("inbox", { ...s.info, at: new Date().toISOString() });
    await syncInbox();
  } catch (e) { console.error("inbox background", e); }
}
