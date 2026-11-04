import "server-only";
import { withSchool } from "./db";
import { searchMail, type MailHit } from "./inbox";
import { googleKv, googleKvSet, type UnmatchedPerson } from "./meet";

// Check Meet joins (4 Nov): before asking an admin who someone was, look through what the school already knows:
// taster requests, enquiries, parents, students, and the connected inboxes (the school's and anyone else's connected,
// e.g. the principal's). What's found is shown on the person's card, and a matching taster or student is picked for you.
export type Clue = { kind: "taster" | "enquiry" | "parent" | "student" | "email"; text: string; href?: string; studentId?: string; date?: string };
export type PersonClues = { clues: Clue[]; suggest: string | null; searched: string[] };

const words = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z' -]+/g, " ").trim().split(/\s+/).filter((w) => w.length >= 2);
const dm = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return ""; } };

export async function joinClues(people: UnmatchedPerson[]): Promise<Record<string, PersonClues>> {
  const out: Record<string, PersonClues> = {};
  for (const p of people.slice(0, 20)) {
    const email = (p.email ?? "").toLowerCase() || null;
    // a Meet name like "Mum's iPad" or "Dad" isn't a person's name: only use names that look like one
    const device = /\b(i?pad|iphone|android|samsung|galaxy|laptop|pc|mac|macbook|chromebook|computer|tablet|phone|mum|mom|dad|mummy|daddy|guest|user|owner|family|home|kitchen|office|teacher|class|room)\b/i;
    const nm = /@/.test(p.who) || device.test(p.who) ? [] : words(p.who).filter((w) => /^[A-Z]/.test(w) || w.length > 2);
    const first = nm[0] ?? null, sur = nm.length > 1 ? nm[nm.length - 1] : null;
    const clues: Clue[] = []; let suggest: string | null = null;
    await withSchool(async (q) => {
      const t = await q<{ child: string; parent: string; pemail: string; at: string; sid: string | null; how: string }>(`select coalesce(child_name, '') as child,
          trim(coalesce(parent_first_name, '') || ' ' || coalesce(parent_last_name, '')) as parent, coalesce(parent_email::text, '') as pemail, created_at::text as at, student_id::text as sid,
          case when lower(child_email::text) = $1 then 'their email' when lower(parent_email::text) = $1 then 'the parent''s email'
               when $3::text is not null and child_name ilike $2 || '%' then 'the name' else 'the surname' end as how
        from taster_requests where lower(child_email::text) = $1 or lower(parent_email::text) = $1
          or ($3::text is not null and (lower(parent_last_name) = lower($3) or child_name ilike '%' || $3 || '%'))
        order by created_at desc limit 3`, [email, first ?? "", sur]);
      for (const r of t) {
        clues.push({ kind: "taster", text: `Taster request ${dm(r.at)}: ${r.child || "a child"}${r.parent ? `, parent ${r.parent}` : ""}${r.pemail ? ` (${r.pemail})` : ""}. Matched on ${r.how}.`, href: "/admin/tasters", studentId: r.sid ?? undefined, date: r.at });
        if (r.sid && !suggest) suggest = r.sid;
      }
      if (sur || email) {
        const e = await q<{ name: string; child: string; email: string; at: string; kind: string }>(`select coalesce(name, '') as name, coalesce(child_name, '') as child, coalesce(email::text, '') as email, created_at::text as at, kind
          from enquiries where lower(email::text) = $1 or ($2::text is not null and (name ilike '%' || $2 || '%' or child_name ilike '%' || $2 || '%')) order by created_at desc limit 3`, [email, sur]);
        for (const r of e) clues.push({ kind: "enquiry", text: `${r.kind === "waiting" ? "Waiting list" : "Enquiry"} ${dm(r.at)}: ${r.name}${r.child ? ` for ${r.child}` : ""}${r.email ? ` (${r.email})` : ""}.`, href: "/admin/enquiries", date: r.at });
        const pa = await q<{ name: string; email: string; kids: string | null }>(`select p.first_name || ' ' || p.last_name as name, coalesce(p.email::text, '') as email,
            (select string_agg(s.first_name, ', ') from students s where s.parent_id = p.id) as kids
          from parents p where lower(p.email::text) = $1 or ($2::text is not null and lower(p.last_name) = lower($2)) limit 3`, [email, sur]);
        for (const r of pa) clues.push({ kind: "parent", text: `Parent ${r.name}${r.email ? ` (${r.email})` : ""}${r.kids ? `, children: ${r.kids}` : ""}.`, href: "/admin/families" });
      }
      if (first && sur) {
        const st = await q<{ id: string; name: string; inClass: boolean }>(`select s.id, s.first_name || ' ' || s.last_name as name,
            exists (select 1 from enrolments x join course_groups g on g.id = x.group_id where x.student_id = s.id and g.code = any(string_to_array($3, ', '))) as "inClass"
          from students s where s.first_name ilike $1 and s.last_name ilike $2 limit 3`, [first, sur, p.classes]);
        for (const r of st) { clues.push({ kind: "student", text: `Student ${r.name}${r.inClass ? " (in this class)" : " (not enrolled in this class)"}.`, studentId: r.id }); if (r.inClass && !suggest) suggest = r.id; }
      }
    });
    // the connected inboxes, cached for a day per person so the page stays quick
    const ck = "clues:" + p.key.slice(0, 120);
    let mail = await googleKv<{ at: number; hits: MailHit[]; searched: string[] }>(ck).catch(() => null);
    if (!mail || Date.now() - mail.at > 86400e3) {
      const terms = [email ? `"${email}"` : "", nm.length > 1 ? `"${p.who.replace(/"/g, "")}"` : "", sur ? `("${sur}" (taster OR enquiry OR contact OR booking OR trial OR class))` : ""].filter(Boolean);
      mail = terms.length ? { at: Date.now(), ...(await searchMail(`${terms.join(" OR ")} newer_than:180d`, 4).catch(() => ({ hits: [], searched: [] }))) } : { at: Date.now(), hits: [], searched: [] };
      await googleKvSet(ck, mail).catch(() => {});
    }
    // keep only emails that really mention them (the address, their name, or the surname)
    const needles = [email, p.who && !/@/.test(p.who) && nm.length > 1 ? p.who.toLowerCase() : null, sur ? sur.toLowerCase() : null].filter(Boolean) as string[];
    const relevant = mail.hits.filter((h) => { const hay = `${h.from} ${h.to} ${h.subject} ${h.snippet}`.toLowerCase(); return needles.some((n) => hay.includes(n)); });
    for (const h of relevant.slice(0, 4)) clues.push({ kind: "email", text: `Email ${dm(h.date)} in ${h.mailbox}: “${h.subject || "(no subject)"}” from ${h.from.replace(/<.*>/, "").trim() || h.from}. ${h.snippet.slice(0, 160)}`,
      href: `https://mail.google.com/mail/?authuser=${encodeURIComponent(h.mailbox)}#all/${h.thread}`, date: h.date });
    out[p.key] = { clues, suggest, searched: mail.searched };
  }
  return out;
}
