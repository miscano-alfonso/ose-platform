import "server-only";
import { withSchool } from "./db";
import { getDashboard, getDashboardMore } from "./admin-data";
import { getAiConfig } from "./social";
import { saveWorkshop } from "./workshops-admin";
import { saveCoupon } from "./rules";

// The admin Assistant (as in the prototype): Claude reads the school's data through small, read-only tools and can only
// PROPOSE changes. Each proposal is a card in the admin; nothing changes until an admin presses Apply.
// Runs on the school's own Anthropic key (Social › Connect to Social › AI searches).

export class AsstError extends Error { constructor(msg: string, public status = 400) { super(msg); } }
const fail = (m: string, s = 400): never => { throw new AsstError(m, s); };
type Q = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
const gbp = (p: number) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const YEAR = `(select id from academic_years where school_id = current_school() order by (current_date between starts_on and ends_on) desc, starts_on >= current_date desc, starts_on limit 1)`;
const TERM = `(select id from terms where academic_year_id = ${YEAR} order by (current_date between starts_on and ends_on) desc, (starts_on > current_date), starts_on desc limit 1)`;

export type Proposal = { id: string; kind: "email" | "workshop" | "status" | "coupon"; params: Record<string, unknown>; summary: string };
type Tool = { name: string; description: string; input_schema: Record<string, unknown>; run: (x: Record<string, unknown>, ctx: { proposals: Proposal[] }) => Promise<unknown> };
const obj = (props: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", properties: props, required });
const propose = (ctx: { proposals: Proposal[] }, kind: Proposal["kind"], params: Record<string, unknown>, summary: string) => {
  const id = "pr" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  ctx.proposals.push({ id, kind, params, summary });
  return `Proposed (${id}): ${summary}. Waiting for the admin to approve.`;
};

const TOOLS: Tool[] = [
  { name: "school_overview", description: "Headline numbers for today: students, families, places filled, money collected, next charge, attendance this term, failed payments, enquiries, timetable clashes, what's coming up.",
    input_schema: obj(), run: async () => {
      const [{ t, attention }, m] = await Promise.all([getDashboard(), getDashboardMore(50)]);
      return { year: t.year_label, term: t.term_name ?? "holidays", students: t.students, families: t.families, placesFilled: `${t.taken} of ${t.capacity}`, collectedThisYear: gbp(t.collected),
        nextCharge: t.next_bills_on ? { on: t.next_bills_on, amount: gbp(t.next_amount), families: t.next_families, term: t.next_term } : null,
        attendancePct: m.att.pct, belowFifty: m.att.low.length, failedPayments: { count: t.failed_count, amount: gbp(t.failed_amount) },
        enquiriesOpen: t.enquiries_open, onWaitingLists: t.waiting, timetableClashes: m.clashes, needsAttention: attention.slice(0, 15).map((a) => `${a.kind}: ${a.title} (${a.detail})`), comingUp: m.coming };
    } },
  { name: "search_families", description: "Find families by parent name, child name or email. Returns up to 8 matches with their children, courses and payment status.",
    input_schema: obj({ query: { type: "string" } }, ["query"]), run: async ({ query }) => withSchool(async (q) => {
      const like = "%" + String(query ?? "").toLowerCase().slice(0, 60) + "%";
      const fams = await q<{ id: string; parent: string; email: string }>(`select p.id, p.first_name || ' ' || p.last_name as parent, p.email::text as email from parents p
        where lower(p.first_name || ' ' || p.last_name || ' ' || p.email) like $1 or exists (select 1 from students s where s.parent_id = p.id and lower(s.first_name || ' ' || s.last_name) like $1)
        order by p.last_name limit 8`, [like]);
      const out = [];
      for (const f of fams) {
        const kids = await q<{ name: string; courses: string | null }>(`select s.first_name || ' ' || s.last_name as name,
          (select string_agg(l.name || ' ' || sj.name, ', ') from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
            where e.student_id = s.id and e.status in ('pending','active')) as courses from students s where s.parent_id = $1`, [f.id]);
        const pay = (await q<{ failed: number; next_on: string | null; next_amt: number }>(`select count(*) filter (where i.status = 'failed')::int as failed,
          min(i.due_on) filter (where i.status = 'scheduled')::text as next_on,
          coalesce(sum(i.amount_pence) filter (where i.status = 'scheduled' and i.due_on = (select min(due_on) from instalments i2 join enrolments e2 on e2.id = i2.enrolment_id join students s2 on s2.id = e2.student_id where s2.parent_id = $1 and i2.status = 'scheduled')),0)::int as next_amt
          from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id where s.parent_id = $1`, [f.id]))[0];
        out.push({ parent: f.parent, email: f.email, children: kids, failedPayments: pay.failed, nextPayment: pay.next_on ? { due: pay.next_on, amount: gbp(pay.next_amt) } : null });
      }
      return out;
    }) },
  { name: "attendance", description: "Students and their attendance this term (from Google Meet marks), lowest first. Optionally only those below a percentage. Approved absences don't count against attendance.",
    input_schema: obj({ below: { type: "number" } }), run: async ({ below }) => withSchool((q) => q(`
      select s.first_name || ' ' || s.last_name as student, p.first_name || ' ' || p.last_name as parent,
        round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int as pct,
        count(*) filter (where m.mark in ('present','late'))::int as attended, count(*) filter (where m.mark = 'absent')::int as unexplained_absences,
        count(*) filter (where m.mark = 'approved_absence')::int as approved_absences
      from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id join students s on s.id = m.student_id join parents p on p.id = s.parent_id
      where ev.term_id = ${TERM} group by s.id, p.id having $1::numeric is null or round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0)) < $1::numeric
      order by pct nulls last limit 25`, [below == null ? null : Number(below)])) },
  { name: "failed_payments", description: "Termly instalments that failed, with family, child, course, term and amount.",
    input_schema: obj(), run: async () => withSchool((q) => q(`select p.first_name || ' ' || p.last_name as family, s.first_name as child, l.name || ' ' || sj.name as course, t.name as term,
      to_char(i.amount_pence / 100.0, 'FM£999,990.00') as amount, i.due_on::text as due
      from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join terms t on t.id = i.term_id where i.status = 'failed' order by i.due_on`)) },
  { name: "classes", description: "Classes this year with code, level, subject, teacher, weekly lessons, students booked, capacity, waiting list and status (open, waitlist, priority, closed, hidden). Optionally filter by level (KS3, Pre-GCSE, iGCSE, A-Level).",
    input_schema: obj({ level: { type: "string" } }), run: async ({ level }) => withSchool((q) => q(`select g.code, l.name as level, sj.name as subject, u.name as teacher, g.status::text as status, a.taken as booked, g.capacity, a.waiting as waiting_list,
        (select string_agg((array['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[s.weekday + 1] || ' ' || to_char(s.starts_at,'HH24:MI'), ', ' order by s.weekday) from lesson_slots s where s.group_id = g.id) as lessons
      from course_groups g join course_group_availability a on a.group_id = g.id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
      where g.academic_year_id = ${YEAR} and ($1::text is null or lower(l.name) = lower($1)) order by l.sort_order, sj.name`, [level ? String(level) : null])) },
  { name: "tasters_and_enquiries", description: "Upcoming taster lessons (child, class, date) and open enquiries from the contact form.",
    input_schema: obj(), run: async () => withSchool(async (q) => ({
      tasters: await q(`select r.child_name as child, r.parent_first_name || ' ' || r.parent_last_name as parent, l.name || ' ' || sj.name as class, ev.lesson_date::text as date, to_char(sl.starts_at,'HH24:MI') as time
        from taster_bookings b join taster_requests r on r.id = b.request_id join lesson_events ev on ev.id = b.lesson_event_id join lesson_slots sl on sl.id = ev.slot_id
        join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id where b.status = 'booked' and ev.lesson_date >= current_date order by ev.lesson_date limit 30`),
      enquiries: await q(`select name, kind, left(coalesce(message,''), 300) as message, created_at::date::text as on from enquiries where handled_at is null order by created_at desc limit 20`),
    })) },
  { name: "upcoming_1to1s_and_workshops", description: "Booked 1:1 lessons and workshops coming up in the next 30 days.",
    input_schema: obj(), run: async () => withSchool(async (q) => ({
      oneToOnes: await q(`select b.student_name as student, l.name || ' ' || sj.name as subject, u.name as teacher, to_char(b.starts_at at time zone 'Europe/London','YYYY-MM-DD HH24:MI') as at
        from tutoring_bookings b join teachers t on t.id = b.teacher_id join users u on u.id = t.user_id join levels l on l.id = b.level_id join subjects sj on sj.id = b.subject_id
        where b.starts_at between now() and now() + interval '30 days' and b.status::text not in ('cancelled') order by b.starts_at limit 30`).catch(() => []),
      workshops: await q(`select w.title, w.status::text, to_char(w.starts_at at time zone 'Europe/London','YYYY-MM-DD HH24:MI') as at, w.capacity,
        (select count(*)::int from workshop_bookings x where x.workshop_id = w.id and x.status <> 'cancelled') as booked from workshops w where w.starts_at > now() order by w.starts_at limit 20`),
    })) },
  { name: "report_progress", description: "Report comments for the current report cycle by teacher: how many to write, submitted for review, and approved.",
    input_schema: obj(), run: async () => withSchool((q) => q(`select c.name as cycle, u.name as teacher, count(*) filter (where e.status::text in ('todo','draft','returned'))::int as to_write,
      count(*) filter (where e.status::text = 'submitted')::int as submitted, count(*) filter (where e.status::text = 'approved')::int as approved
      from report_entries e join report_cycles c on c.id = e.cycle_id left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where c.status::text <> 'published' group by c.name, u.name order by c.name, u.name`).catch(() => [])) },
  // ---- proposals: nothing changes until the admin presses Apply ----
  { name: "propose_email", description: "Propose a one-off email for the admin to review and send from Admin › Email. audience: 'families' (every current family), a level name (KS3, Pre-GCSE, iGCSE, A-Level), a class code, or 'teachers'. Write the body in plain text with blank lines between paragraphs. Sign off as OH-SO ED.",
    input_schema: obj({ audience: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, ["audience", "subject", "body"]),
    run: async (x, ctx) => propose(ctx, "email", x, `Email to ${x.audience}: “${x.subject}”`) },
  { name: "propose_workshop", description: "Propose a new workshop, saved as a draft until the admin publishes it. date YYYY-MM-DD, time HH:MM (UK), minutes (default 45), places, price in pounds (0 = free). teacher is a teacher's name.",
    input_schema: obj({ title: { type: "string" }, level: { type: "string" }, subject: { type: "string" }, teacher: { type: "string" }, date: { type: "string" }, time: { type: "string" }, minutes: { type: "number" }, places: { type: "number" }, price: { type: "number" }, summary: { type: "string" } }, ["title", "date", "time"]),
    run: async (x, ctx) => propose(ctx, "workshop", x, `Draft workshop “${x.title}”, ${x.date} ${x.time}${x.teacher ? ", " + x.teacher : ""}, ${Number(x.price) ? "£" + x.price : "free"}`) },
  { name: "propose_class_status", description: "Propose changing a class's status on the website: open, waitlist, closed or hidden. class_code as in the classes tool.",
    input_schema: obj({ class_code: { type: "string" }, status: { type: "string" } }, ["class_code", "status"]),
    run: async (x, ctx) => { if (!["open", "waitlist", "closed", "hidden"].includes(String(x.status))) throw new Error("Status must be open, waitlist, closed or hidden"); return propose(ctx, "status", x, `Class ${x.class_code}: set to ${x.status}`); } },
  { name: "propose_coupon", description: "Propose a discount coupon: code (capitals), percent off, valid until YYYY-MM-DD.",
    input_schema: obj({ code: { type: "string" }, percent: { type: "number" }, until: { type: "string" } }, ["code", "percent"]),
    run: async (x, ctx) => propose(ctx, "coupon", x, `Coupon ${String(x.code).toUpperCase()}: ${x.percent}% off${x.until ? " until " + x.until : ""}`) },
];

const RULES = (name: string, today: string) => `You are the assistant inside the ${name} admin panel (an online school for home-educated secondary students). Today is ${today}. Terms are always called Term 1 to Term 6, never by season.
Answer the admin's question using the tools to look up real data; never invent numbers, names or dates. If a tool returns nothing (for example before families are imported), say so plainly. Be brief and practical: a short answer, then bullets if useful. British English.
You cannot change anything yourself. To suggest a change (an email, a workshop, a class status, a coupon), call the matching propose_ tool; the admin sees a card and decides. Say what you proposed in one line.
Never reveal one family's details in a message to another, and never put phone numbers or payment details in emails.`;

type Msg = { role: "user" | "assistant"; content: unknown };
export async function ask(history: { role: "user" | "assistant"; text: string }[]) {
  const ai = await getAiConfig();
  if (!ai.key) fail("The assistant needs the Anthropic API key. Add it under Social › Connect to Social › AI searches.", 503);
  const school = (await withSchool((q) => q<{ name: string }>(`select name from schools where id = current_school()`)))[0]?.name ?? "OH-SO ED";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const msgs: Msg[] = history.slice(-12).filter((m) => m.text.trim()).map((m) => ({ role: m.role, content: m.text.slice(0, 8000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") fail("Ask a question first.");
  const ctx = { proposals: [] as Proposal[] }, steps: string[] = [];
  const tools = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  let text = "";
  for (let round = 0; round < 8; round++) {
    const res = await fetch(process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ai.key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ai.model || "claude-sonnet-5-5", max_tokens: 2000, system: RULES(school, today), messages: msgs, tools }), signal: AbortSignal.timeout(110000),
    }).catch((e) => fail("Couldn’t reach Claude: " + String((e as Error).message), 502));
    const j = await (res as Response).json().catch(() => ({})) as { content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[]; stop_reason?: string; error?: { message?: string } };
    if (!(res as Response).ok) fail("Claude said: " + (j.error?.message ?? (res as Response).status), 502);
    const content = j.content ?? [];
    text = content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const uses = content.filter((b) => b.type === "tool_use");
    if (j.stop_reason !== "tool_use" || !uses.length) break;
    msgs.push({ role: "assistant", content });
    const results = [];
    for (const u of uses) {
      const tool = TOOLS.find((t) => t.name === u.name);
      steps.push(u.name!.startsWith("propose_") ? "Preparing a proposal" : "Looking up " + u.name!.replace(/_/g, " "));
      let out: unknown;
      try { out = tool ? await tool.run(u.input ?? {}, ctx) : "Unknown tool"; } catch (e) { out = "Error: " + (e as Error).message; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000) });
    }
    msgs.push({ role: "user", content: results });
  }
  return { text: text || "(No answer.)", steps, proposals: ctx.proposals };
}

// ---------- applying a proposal (only when an admin presses Apply) ----------
export async function apply(actorId: string, p: { kind: string; params: Record<string, unknown> }): Promise<{ message: string; href?: string }> {
  const x = p.params ?? {};
  const s = (k: string, n = 200) => String(x[k] ?? "").trim().slice(0, n);
  if (p.kind === "email") {
    const aud = s("audience", 60);
    const value = await withSchool(async (q: Q) => {
      if (/^(families|all|enrolled|parents)$/i.test(aud)) return "families";
      if (/^teachers?$/i.test(aud)) return "teachers";
      const lv = (await q<{ id: string }>(`select id from levels where lower(name) = lower($1)`, [aud]))[0]; if (lv) return `level:${lv.id}`;
      const g = (await q<{ id: string }>(`select id from course_groups where lower(code) = lower($1) order by academic_year_id desc limit 1`, [aud]))[0]; if (g) return `class:${g.id}`;
      return "families";
    });
    const qs = new URLSearchParams({ audience: value, subject: s("subject", 200), body: String(x.body ?? "").slice(0, 6000) });
    return { message: "Email ready to check and send.", href: `/admin/email?${qs}#compose` };
  }
  if (p.kind === "workshop") {
    const ids = await withSchool(async (q: Q) => ({
      level: (await q<{ id: string }>(`select id from levels where lower(name) = lower($1)`, [s("level")]))[0]?.id ?? null,
      subject: (await q<{ id: string }>(`select id from subjects where lower(name) = lower($1)`, [s("subject")]))[0]?.id ?? null,
      teacher: s("teacher") ? (await q<{ id: string }>(`select t.id from teachers t join users u on u.id = t.user_id where lower(u.name) like lower($1) || '%' and t.archived_at is null limit 1`, [s("teacher").split(" ")[0]]))[0]?.id ?? null : null,
    }));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s("date")) || !/^\d{2}:\d{2}$/.test(s("time"))) fail("The proposal needs a date (YYYY-MM-DD) and time (HH:MM).");
    const r = await saveWorkshop(actorId, null, { title: s("title", 120) || "Workshop", levelId: ids.level, subjectId: ids.subject, teacherId: ids.teacher, date: s("date"), time: s("time"),
      minutes: Math.max(15, Math.min(240, Number(x.minutes) || 45)), capacity: Number(x.places) || null, price: Math.round((Number(x.price) || 0) * 100), enrolledPrice: null, teacherPay: 0, summary: s("summary", 600) || null, publish: false });
    if (r.error) fail(r.error);
    return { message: "Workshop saved as a draft. Publish it when you’re happy.", href: `/admin/workshops/${r.id}` };
  }
  if (p.kind === "status") {
    const st = s("status"); if (!["open", "waitlist", "closed", "hidden"].includes(st)) fail("Unknown status.");
    const n = await withSchool(async (q: Q) => {
      const r = await q<{ id: string }>(`update course_groups set status = $2::group_status where lower(code) = lower($1) and academic_year_id in (select id from academic_years where ends_on >= current_date) returning id`, [s("class_code", 40), st]);
      for (const g of r) await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'update', 'course_group', $2, $3)`, [actorId, g.id, JSON.stringify({ status: st, via: "assistant" })]);
      return r.length;
    });
    if (!n) fail("That class wasn’t found.");
    return { message: `Class ${s("class_code", 40)} is now ${st}.`, href: "/admin/classes" };
  }
  if (p.kind === "coupon") {
    const err = await saveCoupon(actorId, { code: s("code", 30).toUpperCase().replace(/\s+/g, ""), pct: Number(x.percent) || null, amount: null, from: null, to: /^\d{4}-\d{2}-\d{2}$/.test(s("until")) ? s("until") : null, max: null });
    if (err) fail(err);
    return { message: "Coupon added.", href: "/admin/prices" };
  }
  return fail("Unknown proposal.");
}
