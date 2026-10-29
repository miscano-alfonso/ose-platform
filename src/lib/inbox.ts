import "server-only";
import { withSchool } from "./db";
import { siteBase } from "./social";
import { googleAccess, mailboxAccess, googleKv, googleKvSet, GMAIL_URL, MeetError, type Mailbox } from "./meet";

// Admin → Email → Inbox, as in the prototype: replies and emails from families, read (read-only) from the school's Gmail inbox
// and linked to the family. Emails from everyone are kept (tagged "Other" when the sender isn't known), unless
// Settings → Email → "Show emails from everyone" is switched off; then only known senders are kept.
export type InboxInfo = { at?: string; added?: number; error?: string; last?: string };
export type InboxRow = { id: string; thread_id: string; mailbox: string | null; replied_at: string | null; from_name: string | null; from_email: string; subject: string; snippet: string; received_at: string;
  parent_id: string | null; family: string | null; kind: string; read: boolean; to_name?: string | null };

/** Every inbox being read: the school's first, then any others connected after it. */
async function boxes(): Promise<Mailbox[]> {
  const [m, more] = await Promise.all([googleKv<Mailbox>("gmail"), googleKv<Mailbox[]>("gmail_more")]);
  return [...(m?.refreshToken ? [m] : []), ...(more ?? []).filter((x) => x.refreshToken)];
}
export async function inboxStatus() {
  const [list, info, reply] = await Promise.all([boxes(), googleKv<InboxInfo>("inbox"), googleKv<string>("inbox_reply_from")]);
  const m = list[0];
  // the demo school shows its made-up emails as if an inbox were connected (nothing is read from or sent to Gmail)
  if (!m && (await withSchool((q) => q<{ d: boolean }>(`select is_demo as d from schools where id = current_school()`)).then((r) => r[0]?.d).catch(() => false)))
    return { connected: true, mailbox: "office@example.com", by: "", info: info ?? {}, mailboxes: [{ mailbox: "office@example.com", by: "the demo", syncRead: true }], replyFrom: "office@example.com" };
  return { connected: !!m, mailbox: m?.mailbox ?? "", by: m?.by ?? "", info: info ?? {},
    mailboxes: list.map((x) => ({ mailbox: x.mailbox ?? "", by: x.by ?? "", syncRead: canSyncRead(x) })), replyFrom: reply || m?.by || m?.mailbox || "" };
}
/** Disconnect one inbox (or all of them). */
export async function disconnectInbox(mailbox?: string) {
  if (!mailbox) { await googleKvSet("gmail", null); await googleKvSet("gmail_more", null); return; }
  const first = await googleKv<Mailbox>("gmail"), more = (await googleKv<Mailbox[]>("gmail_more")) ?? [];
  if (first?.mailbox === mailbox) { const [next, ...rest] = more; await googleKvSet("gmail", next ?? null); await googleKvSet("gmail_more", rest); }
  else await googleKvSet("gmail_more", more.filter((x) => x.mailbox !== mailbox));
}
export async function setInboxEveryone(on: boolean) {
  await googleKvSet("inbox_everyone", on);
  if (on) {   // emails skipped before (unknown senders) are fetched again on the next check, looking back 30 days
    await googleKvSet("inbox_seen", []);
    const prev = (await googleKv<InboxInfo>("inbox")) ?? {}; await googleKvSet("inbox", { ...prev, last: undefined });
  }
}
export async function inboxEveryone() { return (await googleKv<boolean>("inbox_everyone").catch(() => null)) !== false; }
export async function setReplyFrom(email: string) { await googleKvSet("inbox_reply_from", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null); }

export async function inboxList(show: "new" | "all"): Promise<{ rows: InboxRow[]; unread: number }> {
  return withSchool(async (q) => ({
    rows: await q<InboxRow>(`select m.id, m.thread_id, m.mailbox::text, m.replied_at::text, m.from_name, m.from_email::text, m.subject, m.snippet, m.received_at::text, m.parent_id,
        p.first_name || ' ' || p.last_name as family, m.kind, m.read_at is not null as read, tu.name as to_name
      from inbox_messages m left join parents p on p.id = m.parent_id left join users tu on tu.id = m.to_user where ($1 = 'all' or m.read_at is null) order by m.received_at desc limit 200`, [show]),
    unread: (await q<{ n: number }>(`select count(*)::int as n from inbox_messages where read_at is null`))[0].n,
  }));
}
export async function unreadInbox(): Promise<number> {
  return withSchool(async (q) => (await q<{ n: number }>(`select count(*)::int as n from inbox_messages where read_at is null`))[0].n).catch(() => 0);
}
/** Inboxes connected with permission to change read/unread in Gmail (connected or reconnected since update 199). */
export const canSyncRead = (b: Mailbox | null | undefined) => !!b?.scopes?.includes("gmail.modify");
/** Read/unread changed here → the same in Gmail, so Mail on the Mac and phone show it too (best effort). */
async function pushRead(ids: string[], read: boolean) {
  const rows = await withSchool((q) => q<{ gmail_id: string; mailbox: string | null }>(`select gmail_id, mailbox::text from inbox_messages
    where gmail_id not like 'local:%' and id = any($1::uuid[])`, [ids])).catch(() => []);
  if (!rows.length) return;
  const list = await boxes();
  const byBox = new Map<string, string[]>();
  for (const r of rows) { const k = r.mailbox ?? list[0]?.mailbox ?? ""; byBox.set(k, [...(byBox.get(k) ?? []), r.gmail_id]); }
  for (const [mb, gids] of byBox) {
    const i = list.findIndex((b) => b.mailbox === mb); if (i < 0 || !canSyncRead(list[i])) continue;
    try {
      const t = i === 0 ? await googleAccess("gmail") : await mailboxAccess(list[i].refreshToken!);
      for (let k = 0; k < gids.length; k += 900)
        await fetch(`${GMAIL_URL()}/users/me/messages/batchModify`, { method: "POST", signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
          body: JSON.stringify({ ids: gids.slice(k, k + 900), ...(read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] }) }) });
    } catch (e) { console.error("inbox read sync", mb, e); }
  }
}
export async function markInbox(actorId: string, ids: string[] | "all", read: boolean) {
  if (ids === "all") { const unread = (await withSchool((q) => q<{ id: string }>(`select id from inbox_messages where read_at is null`))).map((r) => r.id); await markInbox(actorId, unread, true); return; }
  await pushRead(ids, read);
  if (!ids.length) return;
  await withSchool((q) =>
    // every parameter is used either way (Postgres refuses a query with an unused one, which broke "Mark unread")
    q(`update inbox_messages set read_at = case when $3 then now() end, read_by = case when $3 then $1::uuid end where id = any($2::uuid[])`, [actorId, ids, read]));
}

const fromOf = (v: string) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v); return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: v.trim().toLowerCase() }; };

export async function syncInbox(): Promise<InboxInfo> {
  const list = await boxes();
  const prev = (await googleKv<InboxInfo>("inbox")) ?? {};
  if (!list.length) { const info = { at: new Date().toISOString(), last: prev.last, error: "Connect the school inbox first." }; await googleKvSet("inbox", info); return info; }
  const seen = new Set((await googleKv<string[]>("inbox_seen")) ?? []);
  const days = prev.last ? Math.min(30, Math.max(2, Math.ceil((Date.now() - Date.parse(prev.last)) / 86400e3) + 1)) : 30;   // since the last good read
  let added = 0; const errors: string[] = [];
  for (const [n, box] of list.entries()) {
    let token: string;
    try { token = n === 0 ? await googleAccess("gmail") : await mailboxAccess(box.refreshToken!); }
    catch (e) { errors.push(`${box.mailbox}: ${e instanceof MeetError ? e.message : "couldn’t reach Gmail"}`); continue; }
    const ids: { id: string }[] = []; let pageToken = "", failed = false;
    for (let i = 0; i < 4; i++) {
      const u = new URL(`${GMAIL_URL()}/users/me/messages`); u.searchParams.set("q", `in:inbox newer_than:${days}d -from:me`); u.searchParams.set("maxResults", "100");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { errors.push(`${box.mailbox}: ${r.status === 403 ? "Gmail said no (turn on the Gmail API, then reconnect)" : `Gmail answered ${r.status}`}`); failed = true; break; }
      const j = (await r.json()) as { messages?: { id: string }[]; nextPageToken?: string };
      ids.push(...(j.messages ?? [])); if (!j.nextPageToken) break; pageToken = j.nextPageToken;
    }
    if (failed) continue;
    // read/unread from Gmail (read in Mail on the Mac or phone → read here, and the other way round), last 30 days
    // (reading which are unread only needs read access, so this works for every connected inbox)
    try {
      const unreadIds: string[] = []; let pt = "";
      for (let i = 0; i < 5; i++) {
        const u = new URL(`${GMAIL_URL()}/users/me/messages`); u.searchParams.set("q", "is:unread newer_than:30d"); u.searchParams.set("maxResults", "500"); if (pt) u.searchParams.set("pageToken", pt);
        const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { messages?: { id: string }[]; nextPageToken?: string }; unreadIds.push(...(j.messages ?? []).map((m) => m.id)); if (!j.nextPageToken) break; pt = j.nextPageToken;
      }
      await withSchool((q) => q(`update inbox_messages set read_at = case when gmail_id = any($1::text[]) then null else coalesce(read_at, now()) end
        where gmail_id not like 'local:%' and received_at > now() - interval '29 days' and (mailbox = $2 or ($3 and mailbox is null))
          and (read_at is null) <> (gmail_id = any($1::text[]))`, [unreadIds, box.mailbox ?? "", n === 0]));
    } catch (e) { errors.push(`${box.mailbox}: couldn’t read which emails are read (${e instanceof Error ? e.message : "?"})`); }
    const everyone = (await googleKv<boolean>("inbox_everyone").catch(() => null)) !== false;   // on unless switched off
    await withSchool(async (q) => {
      const have = new Set((await q<{ g: string }>(`select gmail_id as g from inbox_messages where gmail_id = any($1::text[])`, [ids.map((x) => x.id)])).map((x) => x.g));
      for (const { id } of ids) {
        if (have.has(id) || seen.has(id)) continue;
        const r = await fetch(`${GMAIL_URL()}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        const m = (await r.json()) as { threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
        const h = Object.fromEntries((m.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
        const to = [...new Set(`${h.to ?? ""},${h.cc ?? ""}`.toLowerCase().match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? [])].slice(0, 30);
        const from = fromOf(h.from ?? ""), msgId = (h["message-id"] ?? "").trim().slice(0, 300) || null;
        seen.add(id);
        if (!/@/.test(from.email)) continue;
        // the same email sent to two of the school's inboxes shows once
        if (msgId && (await q(`select 1 from inbox_messages where message_id = $1 limit 1`, [msgId])).length) continue;
        // who is it? a family first, then someone who enquired, is waiting, or booked a taster
        const [who] = await q<{ parent_id: string | null; kind: string }>(`
          select null::uuid as parent_id, 'staff' as kind, 0 as o from users u join teachers t on t.user_id = u.id where lower(u.email::text) = lower($1) and u.disabled_at is null
          union all select p.id, 'family', 1 from parents p where p.email = $1
          union all select g.parent_id, 'family', 2 from guardians g where g.email = $1
          union all select r.parent_id, 'taster', 3 from taster_requests r where r.parent_email = $1
          union all select null, 'waiting', 4 from waitlist_entries w where w.email = $1
          union all select null, 'enquiry', 5 from enquiries e where e.email = $1
          order by o limit 1`, [from.email]);
        if (!who && !everyone) continue;   // someone the school doesn't know: only kept when "Show emails from everyone" is on
        const ins = await q(`insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, received_at, parent_id, kind, mailbox, message_id, to_addrs, read_at)
          values (current_school(), $1, $2, $3, $4, $5, $6, to_timestamp($7::bigint / 1000.0), $8, $9, $10, $11, $12, case when $13 then null else now() end) on conflict (school_id, gmail_id) do nothing returning id`,
          [id, m.threadId, from.name?.slice(0, 120) ?? null, from.email, (h.subject ?? "").slice(0, 300), decode(m.snippet ?? "").slice(0, 400), m.internalDate ?? String(Date.now()), who?.parent_id ?? null, who?.kind ?? "other", box.mailbox ?? null, msgId, to, (m.labelIds ?? ["UNREAD"]).includes("UNREAD")]);
        added += ins.length;
      }
    });
  }
  // kept for a year; nothing kept for a family whose data was erased
  await withSchool((q) => q(`delete from inbox_messages where received_at < now() - interval '12 months' or parent_id in (select id from parents where email::text like 'erased-%')`));
  await googleKvSet("inbox_seen", [...seen].slice(-1600));
  const ok = errors.length < list.length;
  const info: InboxInfo = { at: new Date().toISOString(), added, last: ok ? new Date().toISOString() : prev.last, ...(errors.length ? { error: errors.join("; ") } : {}) };
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

// ---------- reading a whole email and replying from the admin ----------
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function textOf(p: Part | undefined): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return b64(p.body.data);
  for (const c of p.parts ?? []) { const t = textOf(c); if (t) return t; }
  if (p.mimeType === "text/html" && p.body?.data) return b64(p.body.data).replace(/<(br|\/p|\/div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
  return "";
}
/** The connected inbox for an address, with an access token. */
async function tokenFor(mailbox: string | null): Promise<{ token: string; box: Mailbox } | null> {
  const list = await boxes();
  const i = mailbox ? list.findIndex((b) => b.mailbox === mailbox.toLowerCase()) : 0;
  if (i < 0) return null;
  return { token: i === 0 ? await googleAccess("gmail") : await mailboxAccess(list[i].refreshToken!), box: list[i] };
}
export type FullEmail = { body: string; to: string; replied: { at: string; from: string; body: string } | null; files?: { id: string; name: string; size: number }[]; links?: string[] };
/** The full text of an email (fetched from Gmail when it's opened; only the preview is stored). */
export async function inboxMessage(id: string): Promise<FullEmail | { error: string }> {
  const m = (await withSchool((q) => q<{ gmail_id: string; mailbox: string | null; replied_at: string | null; reply_from: string | null; reply_body: string | null }>(
    `select gmail_id, mailbox::text, replied_at::text, reply_from::text, reply_body from inbox_messages where id = $1`, [id])))[0];
  if (!m) return { error: "That email wasn’t found." };
  if (m.gmail_id.startsWith("local:")) {   // written in the site by a teacher
    const r = (await withSchool((q) => q<{ body: string | null; links: string[] | null; files: { id: string; name: string; size: number }[]; to_name: string | null }>(`select m.body, m.links, tu.name as to_name,
      coalesce((select json_agg(json_build_object('id', f.id, 'name', f.name, 'size', f.size) order by f.created_at) from inbox_attachments f where f.message_id = m.id), '[]'::json) as files
      from inbox_messages m left join users tu on tu.id = m.to_user where m.id = $1`, [id])))[0];
    return { body: r?.body ?? "", to: r?.to_name ? `${r.to_name} (sent from the teacher’s Email page)` : "the school (sent from the teacher’s Email page)",
      replied: m.replied_at ? { at: m.replied_at, from: m.reply_from ?? "", body: m.reply_body ?? "" } : null, files: r?.files ?? [], links: r?.links ?? [] };
  }
  try {
    const t = await tokenFor(m.mailbox); if (!t) return { error: `${m.mailbox} isn’t connected any more.` };
    const r = await fetch(`${GMAIL_URL()}/users/me/messages/${m.gmail_id}?format=full`, { headers: { authorization: `Bearer ${t.token}` }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { error: `Gmail answered ${r.status}.` };
    const j = (await r.json()) as { payload?: Part & { headers?: { name: string; value: string }[] } };
    const to = (j.payload?.headers ?? []).find((h) => h.name.toLowerCase() === "to")?.value ?? "";
    const body = textOf(j.payload).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
    return { body, to, replied: m.replied_at ? { at: m.replied_at, from: m.reply_from ?? "", body: m.reply_body ?? "" } : null };
  } catch (e) { return { error: e instanceof MeetError ? e.message : "Couldn’t reach Gmail." }; }
}
const hdr = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
/** Send a reply from the Reply-from inbox, threaded with the family's email (In-Reply-To / References). */

// ---------- Each staff member's email signature: name, job title and the school logo (blue, for light-mode inboxes) ----------
export type Signature = { name: string; title: string; email: string; web: string; logo: string; logoDark: string };
const sigEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const webOf = (s: string) => s.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
/** Name, job title, email address and website (the email's domain unless set), then the logo. */
export async function signatureFor(user: { id: string; name: string; email?: string }): Promise<Signature> {
  const [v, base] = await Promise.all([googleKv<{ title?: string; email?: string; web?: string }>(`sig_${user.id}`).catch(() => null), siteBase().catch(() => "")]);
  const site = (process.env.SITE_URL || base || "").replace(/\/$/, "");
  const at = (f: string) => site ? `${site}/${f}` : `/${f}`;
  const email = v?.email ?? user.email ?? "";
  // OH-SO ED's own logo; another school gets its uploaded logo, or none (never OH-SO ED's)
  const { activeSchool, siteSchool } = await import("./db");
  const own = (await activeSchool().catch(() => siteSchool())) === siteSchool();
  const custom = own ? false : !!(await import("./brand").then((b) => b.getBrandAsset("logo")).catch(() => null));
  const logo = own ? at("ose-logo-blue.png") : custom ? at("brand/logo") : "", logoDark = own ? at("ose-logo-white.png") : logo;
  return { name: user.name, title: v?.title ?? "", email, web: v?.web ?? (email.split("@")[1] ?? ""), logo, logoDark };
}
export async function saveSignature(userId: string, d: { title: string; email: string; web: string }) {
  const email = d.email.trim().toLowerCase();
  await googleKvSet(`sig_${userId}`, { title: d.title.replace(/\s+/g, " ").trim().slice(0, 80),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "", web: /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(webOf(d.web)) ? webOf(d.web).slice(0, 120) : "" });
}
/** The signature as plain text (for the text part of the email and the "You replied" note). */
export const sigText = (sig: Pick<Signature, "name" | "title" | "email" | "web">) => [sig.name, sig.title, sig.email, sig.web].filter(Boolean).join("\n");
/** The reply as an HTML email: the text as written, then the signature with the logo underneath.
 *  The logo is blue; email apps that tell the email they're in dark mode (Apple Mail, iPhone/iPad Mail, Outlook,
 *  some others) are given the white logo instead. Gmail doesn't say, so Gmail readers always see the blue one. */
export function replyHtml(body: string, sig: Signature): string {
  const p = sigEsc(body).replace(/\n/g, "<br>");
  const img = (src: string, cls: string, hide: boolean) => `<img class="${cls}" src="${sigEsc(src)}" width="130" alt="OH-SO ED Online School" style="${hide ? "display:none;max-height:0;overflow:hidden;mso-hide:all;" : "display:block;"}border:0;width:130px;height:auto">`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">`
    + `<style>@media (prefers-color-scheme: dark){.ose-l{display:none!important}.ose-d{display:block!important;max-height:none!important}}`
    + `[data-ogsc] .ose-l,[data-ogsb] .ose-l{display:none!important}[data-ogsc] .ose-d,[data-ogsb] .ose-d{display:block!important;max-height:none!important}</style></head><body>`
    + `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">${p}`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4">`
    + `<b>${sigEsc(sig.name)}</b>${sig.title ? `<br>${sigEsc(sig.title)}` : ""}`
    + `${sig.email || sig.web ? `<div style="margin-top:8px">${sig.email ? `<a href="mailto:${sigEsc(sig.email)}" style="color:inherit;text-decoration:none">${sigEsc(sig.email)}</a>` : ""}${sig.email && sig.web ? "<br>" : ""}${sig.web ? `<a href="https://${sigEsc(sig.web)}" style="color:inherit;text-decoration:none">${sigEsc(sig.web)}</a>` : ""}</div>` : ""}</td></tr>`
    + (sig.logo ? `<tr><td style="padding-top:16px">${img(sig.logo, "ose-l", false)}${sig.logoDark !== sig.logo ? img(sig.logoDark, "ose-d", true) : ""}</td></tr>` : "") + `</table></div></body></html>`;
}

export async function replyInbox(actor: { id: string; name: string; email?: string }, id: string, text: string): Promise<string | null> {
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body) return "Write a reply first.";
  const m = (await withSchool((q) => q<{ gmail_id: string; thread_id: string; mailbox: string | null; from_email: string; from_name: string | null; subject: string; message_id: string | null }>(
    `select gmail_id, thread_id, mailbox::text, from_email::text, from_name, subject, message_id from inbox_messages where id = $1`, [id])))[0];
  if (!m) return "That email wasn’t found.";
  const st = await inboxStatus(), from = st.replyFrom;
  try {
    const sender = await tokenFor(from);
    if (!sender) return `To send from ${from}, connect that inbox first (Connect another inbox), or change Reply from.`;
    // the original's Message-ID (for threading), read from the inbox it arrived in if it wasn't stored
    const local = m.gmail_id.startsWith("local:");   // written in the site: the reply starts a new email to the teacher
    let msgId = local ? null : m.message_id, refs = "";
    if (!local && (!msgId || (m.mailbox ?? st.mailbox) !== from)) {
      const src = await tokenFor(m.mailbox);
      if (src) {
        const r = await fetch(`${GMAIL_URL()}/users/me/messages/${m.gmail_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, { headers: { authorization: `Bearer ${src.token}` }, signal: AbortSignal.timeout(20000) });
        if (r.ok) { const h = Object.fromEntries((((await r.json()) as { payload?: { headers?: { name: string; value: string }[] } }).payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value])); msgId = h["message-id"] ?? msgId; refs = h.references ?? ""; }
      }
    }
    // the reply goes as text and HTML, with the signature (name, job title, logo) under it
    const sig = await signatureFor(actor), text = `${body}\n\n${sigText(sig)}`;
    const bnd = `ose-${crypto.randomUUID()}`;
    const part = (type: string, content: string) => [`--${bnd}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", Buffer.from(content).toString("base64").replace(/(.{76})/g, "$1\r\n")];
    const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
    const to = m.from_name ? `${hdr(m.from_name.replace(/["\\]/g, ""))} <${m.from_email}>` : m.from_email;
    const raw = [`From: ${hdr(actor.name)} <${from}>`, `To: ${to}`, `Subject: ${hdr(subject)}`, ...(msgId ? [`In-Reply-To: ${msgId}`, `References: ${(refs + " " + msgId).trim()}`] : []),
      "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${bnd}"`, "", ...part("text/plain", text), ...part("text/html", replyHtml(body, sig)), `--${bnd}--`, ""].join("\r\n");
    const sameBox = !local && (m.mailbox ?? st.mailbox) === from;
    const r = await fetch(`${GMAIL_URL()}/users/me/messages/send`, { method: "POST", signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${sender.token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url"), ...(sameBox ? { threadId: m.thread_id } : {}) }) });
    if (r.status === 403 || r.status === 401) return `Gmail won’t let the site send from ${from} yet. Disconnect that inbox and connect it again, ticking the box to send email.`;
    if (!r.ok) return `Gmail answered ${r.status}. The reply wasn’t sent.`;
    await withSchool((q) => q(`update inbox_messages set replied_at = now(), replied_by = $2, reply_from = $3, reply_body = $4, read_at = coalesce(read_at, now()), read_by = coalesce(read_by, $2) where id = $1`, [id, actor.id, from, body.slice(0, 20000)]));
    return null;
  } catch (e) { return e instanceof MeetError ? e.message : "Couldn’t reach Gmail. The reply wasn’t sent."; }
}
