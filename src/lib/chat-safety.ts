import "server-only";
import { createHash } from "node:crypto";
import { withSchool } from "./db";
import { sendHtml } from "./email";

// Chat safety rules (Admin → Student chat → Safety rules). Each student message is checked before it's posted:
// a rule set to "block" stops the message (staff still see the attempt), "alert" lets it through and flags it.
// Flags show on the admin dashboard (Needs attention) and Student chat, and can be emailed to the safeguarding lead.
// Families see the school's chat rules, and a parent ticks to agree them with their child before turning chat on.

type Q = <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>;
export type RuleId = "language" | "unkind" | "personal" | "meetup" | "wellbeing";
export type RuleMode = "off" | "alert" | "block";
export const RULES: { id: RuleId; name: string; about: string; canBlock: boolean }[] = [
  { id: "language", name: "Bad language", about: "Swearing and rude words, including disguised spellings.", canBlock: true },
  { id: "unkind", name: "Bullying and unkind words", about: "Name-calling, put-downs, leaving people out, threats.", canBlock: true },
  { id: "personal", name: "Sharing personal details", about: "Phone numbers, email and home addresses, postcodes, passwords, usernames.", canBlock: true },
  { id: "meetup", name: "Arranging to meet or move to another app", about: "“Meet me at…”, “add me on Snapchat”, “WhatsApp me”, other apps by name.", canBlock: true },
  { id: "wellbeing", name: "Worrying words about safety or wellbeing", about: "Words that suggest a child may be at risk or struggling. Never blocked, so a child asking for help is always heard; the alert is marked urgent.", canBlock: false },
];
export type SafetyCfg = { modes: Record<RuleId, RuleMode>; email: string; rules: string[] };
export const DEFAULT_SAFETY: SafetyCfg = {
  modes: { language: "block", unkind: "alert", personal: "block", meetup: "alert", wellbeing: "alert" },
  email: "",
  rules: [
    "Be kind. Treat everyone the way you’d like to be treated.",
    "Keep chat about your classes and learning.",
    "No swearing, rude words or unkind comments about anyone.",
    "Never share personal details: phone numbers, addresses, passwords or social media accounts.",
    "Don’t arrange to meet up or move the conversation to another app.",
    "Teachers and the office can see every chat. If anything worries you, press Report or tell an adult.",
  ],
};
/** A short fingerprint of the rules, so a parent's agreement is tied to the wording they saw. */
export const rulesVersion = (rules: string[]) => createHash("sha256").update(rules.join("\n")).digest("hex").slice(0, 10);

// ---------- what each rule looks for (word boundaries, common disguises like f*ck, sh1t, fuuuck) ----------
const loose = (w: string) => w.split("").map((c) => ({ a: "[a@4*]", e: "[e3*]", i: "[i1!*]", o: "[o0*]", u: "[uv*]", s: "[s5$*]" } as Record<string, string>)[c] ?? c).map((c) => c + "+").join("[\\s._-]?");
const words = (list: string[]) => new RegExp(`(^|[^a-z])(${list.map(loose).join("|")})(?=$|[^a-z])`, "i");
const PATTERNS: Record<RuleId, RegExp[]> = {
  language: [words(["fuck", "fucking", "fucker", "fck", "fk", "fuk", "shit", "shite", "bullshit", "bitch", "bastard", "cunt", "dick", "dickhead", "prick", "wanker", "wank", "twat", "arsehole", "asshole", "arse", "piss", "pissed", "bollocks", "slag", "slut", "whore", "wtf", "stfu", "omfg"])],
  unkind: [words(["loser", "idiot", "stupid", "dumb", "retard", "retarded", "freak", "ugly", "fatty", "fatso", "weirdo", "pathetic", "worthless", "useless", "kys", "nobody likes you", "no one likes you", "everyone hates you", "go away", "shut up", "you smell", "kill yourself", "go die", "i will hurt you", "i'll hurt you", "beat you up", "you're not invited", "dont talk to", "don't talk to"])],
  personal: [/(\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b/, /(\+\d{1,3}[\s-]?\d|\b0\d)\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/, /\b[\w.+-]+@[\w-]+\.[\w.]+\b/i, /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i,
    words(["my address", "i live at", "my number", "my phone number", "my password", "my snap is", "my insta is", "my username is"])],
  meetup: [words(["meet me", "meet up", "meetup", "come to my house", "come round", "come over", "my house at", "add me on", "add me", "dm me", "message me on", "text me", "call me", "facetime", "whatsapp me", "snap me", "snapchat", "instagram", "insta", "tiktok", "whatsapp", "discord", "outside school"])],
  wellbeing: [words(["kill myself", "killing myself", "want to die", "wanna die", "end it all", "hurt myself", "hurting myself", "cut myself", "cutting myself", "self harm", "self-harm", "suicide", "suicidal", "nobody would care if", "no one would care if", "better off without me", "i hate my life", "scared to go home", "he hits me", "she hits me", "they hit me", "touched me", "don't tell anyone", "dont tell anyone", "our secret", "keep it secret"])],
};

/** Which rules a message breaks, and whether it must be blocked. */
export function checkMessage(body: string, cfg: SafetyCfg): { hits: { rule: RuleId; matched: string }[]; block: RuleId | null } {
  const text = body.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const hits: { rule: RuleId; matched: string }[] = [];
  for (const r of RULES) {
    if (cfg.modes[r.id] === "off") continue;
    for (const p of PATTERNS[r.id]) { const m = text.match(p); if (m) { hits.push({ rule: r.id, matched: (m[2] ?? m[0]).trim().slice(0, 60) }); break; } }
  }
  const block = hits.find((h) => cfg.modes[h.rule] === "block" && RULES.find((r) => r.id === h.rule)!.canBlock)?.rule ?? null;
  return { hits, block };
}

export async function safetyCfg(q?: Q): Promise<SafetyCfg> {
  const run = async (qq: Q) => (await qq<{ value: Partial<SafetyCfg> }>(`select value from meet_kv where key = 'chat_safety'`))[0]?.value ?? {};
  const v = q ? await run(q) : await withSchool(run);
  const modes = { ...DEFAULT_SAFETY.modes };
  for (const r of RULES) { const m = v.modes?.[r.id]; if (m === "off" || m === "alert" || (m === "block" && r.canBlock)) modes[r.id] = m; }
  return { modes, email: typeof v.email === "string" ? v.email : "", rules: Array.isArray(v.rules) && v.rules.length ? v.rules.map(String).slice(0, 20) : DEFAULT_SAFETY.rules };
}
export async function saveSafetyCfg(c: SafetyCfg) {
  await withSchool((q) => q(`insert into meet_kv (school_id, key, value) values (current_school(), 'chat_safety', $1) on conflict (school_id, key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(c)]));
}

const LABEL = Object.fromEntries(RULES.map((r) => [r.id, r.name])) as Record<RuleId, string>;
/** Check a student's message before it's posted. Returns the reason it was blocked, or null to post it;
 *  `after` records the flags once the message exists (pass its id). */
export async function screenMessage(studentId: string, chatId: string, body: string): Promise<{ blocked: string | null; after: (messageId: string) => Promise<void> }> {
  const cfg = await safetyCfg();
  const { hits, block } = checkMessage(body, cfg);
  const record = async (messageId: string | null) => {
    if (!hits.length) return;
    await withSchool((q) => q(`insert into student_chat_flags (school_id, chat_id, message_id, sender_student_id, body, rules, matched, blocked) values (current_school(), $1, $2, $3, $4, $5, $6, $7)`,
      [chatId, messageId, studentId, body, hits.map((h) => h.rule), hits.map((h) => h.matched).join(", "), !messageId]));
    await alertEmail(cfg, studentId, body, hits.map((h) => h.rule), !messageId).catch((e) => console.error("chat alert email", e));
  };
  if (block) {
    await record(null);
    const why = block === "language" ? "it has words that aren’t allowed" : block === "unkind" ? "it could upset someone" : block === "personal" ? "it looks like it shares personal details" : "it looks like it’s arranging to meet or chat somewhere else";
    return { blocked: `Your message wasn’t sent because ${why}. Please check the chat rules.`, after: async () => {} };
  }
  return { blocked: null, after: (id) => record(id) };
}

async function alertEmail(cfg: SafetyCfg, studentId: string, body: string, rules: RuleId[], blocked: boolean) {
  const to = cfg.email.split(/[\s,;]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 5);
  if (!to.length) return;
  const who = (await withSchool((q) => q<{ name: string }>(`select first_name || ' ' || last_name as name from students where id = $1`, [studentId])))[0]?.name ?? "A student";
  const urgent = rules.includes("wellbeing");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const base = (process.env.SITE_URL || "").replace(/\/$/, "");
  const html = `<p>${urgent ? "<b>Urgent: a message in student chat may mean a child is at risk or struggling.</b> Please follow your safeguarding procedure today.</p><p>" : ""}`
    + `${esc(who)} ${blocked ? "tried to send" : "sent"} a message that matched: <b>${rules.map((r) => LABEL[r]).join(", ")}</b>${blocked ? " (it was blocked)" : ""}.</p>`
    + `<blockquote style="border-left:3px solid #ccc;padding-left:10px;margin:10px 0">${esc(body)}</blockquote>`
    + `<p>${base ? `<a href="${base}/admin/student-chat">Open Student chat</a> to review it.` : "Open Admin → Student chat to review it."}</p>`;
  await sendHtml(`${urgent ? "URGENT: " : ""}Chat alert: ${rules.map((r) => LABEL[r].toLowerCase()).join(", ")} (${who})`, html, to, "chat-alert");
}

export type ChatFlag = { id: string; chat_id: string; message_id: string | null; body: string; rules: RuleId[]; matched: string | null; blocked: boolean; sender: string; chat: string; created_at: string; hidden: boolean };
export async function openFlags(): Promise<ChatFlag[]> {
  return withSchool((q) => q<ChatFlag>(`select f.id, f.chat_id, f.message_id, f.body, f.rules, f.matched, f.blocked, coalesce(s.first_name || ' ' || s.last_name, 'A student') as sender,
      coalesce(case when c.kind = 'class' then l.name || ' ' || sj.name end, 'Private chat') as chat, f.created_at::text, coalesce(m.hidden_at is not null, false) as hidden
    from student_chat_flags f join student_chats c on c.id = f.chat_id left join course_groups g on g.id = c.group_id left join levels l on l.id = g.level_id
    left join subjects sj on sj.id = g.subject_id left join students s on s.id = f.sender_student_id left join student_chat_messages m on m.id = f.message_id
    where f.status = 'open' order by ('wellbeing' = any(f.rules)) desc, f.created_at desc limit 100`));
}
export async function resolveFlag(userId: string, id: string, hide: boolean) {
  await withSchool(async (q) => {
    const f = (await q<{ message_id: string | null }>(`update student_chat_flags set status = $3, resolved_by = $2, resolved_at = now() where id = $1 returning message_id`, [id, userId, hide ? "hidden" : "no_action"]))[0];
    if (hide && f?.message_id) await q(`update student_chat_messages set hidden_at = coalesce(hidden_at, now()), hidden_by = coalesce(hidden_by, $2) where id = $1`, [f.message_id, userId]);
  });
}
export const ruleLabel = (r: string) => LABEL[r as RuleId] ?? r;
