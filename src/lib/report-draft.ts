import "server-only";
import { withSchool, runAsSchool, siteSchool } from "./db";
import { getAiConfig } from "./social";

// "Draft with AI" for report comments (31 Oct). Claude writes a first attempt for one student from what the school knows:
// earlier reports (so it builds on them and doesn't repeat them), this term's Classroom work in the class (titles, marks,
// late or missing, rubric levels), reward points and their reasons, attendance, and what the student said in the Meet chat
// of recent lessons. The teacher edits it before saving: nothing is saved here.
// Note: Google Classroom doesn't let other apps read the private comments on students' work, so those can't be used.

type Ctx = {
  student: string; first: string; klass: string; cycle: string; teacher: string; gcse: boolean; group_id: string; marks_from: string; comments_due: string;
  previous: { cycle: string; klass: string; comment: string; effort: number | null; working: number | null; predicted: number | null }[];
  work: { title: string; due: string | null; max: number | null; points: number | null; state: string; late: boolean; missing: boolean; rubric: unknown }[];
  rewards: { points: number; reason: string; on: string }[];
  att: number | null; lessons: number;
};

async function context(actor: { id: string; role: string }, entryId: string): Promise<Ctx | null> {
  return withSchool(async (q) => {
    const e = (await q<Omit<Ctx, "previous" | "work" | "rewards"> & { student_id: string }>(`
      select e.student_id, s.first_name || ' ' || s.last_name as student, coalesce(nullif(s.known_as, ''), s.first_name) as first, l.name || ' ' || sj.name as klass,
        c.name as cycle, coalesce(tu.name, '') as teacher, (l.name ilike '%GCSE%' and l.name not ilike 'Pre-%') as gcse, e.group_id, c.marks_from::text, c.comments_due::text,
        (select round(100.0 * count(*) filter (where m.mark in ('present','late')) / nullif(count(*) filter (where m.mark <> 'approved_absence'), 0))::int
           from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where ev.group_id = e.group_id and m.student_id = e.student_id and ev.lesson_date >= c.marks_from - 14) as att,
        (select count(*)::int from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id where ev.group_id = e.group_id and m.student_id = e.student_id and ev.lesson_date >= c.marks_from - 14) as lessons
      from report_entries e join report_cycles c on c.id = e.cycle_id join students s on s.id = e.student_id join course_groups g on g.id = e.group_id
        join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id left join teachers t on t.id = g.teacher_id left join users tu on tu.id = t.user_id
      where e.id = $1 and ($3 = 'school_admin' or t.user_id = $2)`, [entryId, actor.id, actor.role]))[0];
    if (!e) return null;
    const previous = await q<Ctx["previous"][number]>(`
      select c.name as cycle, l.name || ' ' || sj.name as klass, e.comment, e.effort, e.working_grade as working, e.predicted_grade as predicted
      from report_entries e join report_cycles c on c.id = e.cycle_id join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where e.student_id = $1 and e.id <> $2 and coalesce(e.comment, '') <> '' and (c.status = 'published' or e.status = 'approved')
      order by (e.group_id = $3) desc, c.publish_on desc limit 4`, [e.student_id, entryId, e.group_id]);
    const work = await q<Ctx["work"][number]>(`
      select cw.title, cw.due_at::date::text as due, cw.max_points::float as max, cs.points::float as points, coalesce(cs.state::text, 'assigned') as state, coalesce(cs.late, false) as late,
        (coalesce(cs.state::text, 'assigned') = 'assigned' and cw.due_at < now()) as missing, cs.rubric
      from classroom_coursework cw left join classroom_submissions cs on cs.coursework_id = cw.id and cs.student_id = $1
      where cw.group_id = $2 and coalesce(cw.due_at::date, cw.created_at::date) between $3::date - 14 and $4::date + 7
      order by cw.due_at nulls last limit 25`, [e.student_id, e.group_id, e.marks_from, e.comments_due]);
    const rewards = await q<Ctx["rewards"][number]>(`select points, reason, awarded_on::text as on from reward_points
      where student_id = $1 and group_id = $2 and awarded_on >= $3::date - 14 order by awarded_on desc limit 15`, [e.student_id, e.group_id, e.marks_from]);
    return { ...e, previous, work, rewards };
  });
}

const SYSTEM = `You help UK secondary school teachers at a live online school draft end-of-term report comments for parents.
Write ONE comment for the student, as the teacher, in British English: warm, specific, honest and encouraging. 70 to 120 words, plain text, one or two short paragraphs, no headings, lists, emoji or sign-off.
- Name at least one specific piece of work by its title (and what it showed), so the comment is clearly about this child.
- Say what they have done well, then give one or two clear, practical targets for next term, linked to the subject.
- If there is a previous report, build on it: note progress on earlier targets where the evidence shows it, and don't repeat its wording.
- Use the effort and progress scores the teacher has chosen as the overall tone.
- Only use facts given to you. Never invent marks, events, quotes or diagnoses. Don't mention SEND, attendance percentages or reward point totals by number.
- Use the student's first name, and they/their unless the previous reports clearly use he or she.
Reply with the comment only.`;

/** A first draft of the comment for one report entry. `scores` are what the teacher has picked on the page right now. */
export async function draftComment(actor: { id: string; role: string }, entryId: string, scores: { effort?: number | null; progress?: number | null; working?: number | null; predicted?: number | null }, demo: boolean): Promise<{ text?: string; error?: string }> {
  if (!/^[0-9a-f-]{36}$/.test(entryId)) return { error: "That report wasn’t found." };
  const c = await context(actor, entryId);
  if (!c) return { error: "That report isn’t one of yours." };
  // the demo school borrows the platform's key, a few times a day, so visitors can try it
  const ai = demo ? await runAsSchool(siteSchool(), getAiConfig) : await getAiConfig();
  if (!ai.key) return { error: "Drafting needs the Anthropic API key (Social › Connect to Social › AI searches)." };
  if (demo) {
    const used = await withSchool((q) => q<{ n: number }>(`insert into meet_kv (school_id, key, value) values (current_school(), 'ai_drafts:' || current_date, '1'::jsonb)
      on conflict (school_id, key) do update set value = to_jsonb(coalesce((meet_kv.value)::text::int, 0) + 1), updated_at = now() returning (value)::text::int as n`)).then((r) => r[0]?.n ?? 0).catch(() => 0);
    if (used > 40) return { error: "The demo has used today’s AI drafts. Try again tomorrow." };
  }
  const { studentChatLines } = await import("./recordings");
  const chat = demo ? [] : await studentChatLines(c.group_id, [c.student, c.first], c.marks_from, 25).catch(() => []);
  const pct = (w: Ctx["work"][number]) => w.points != null && w.max ? ` ${w.points}/${w.max} (${Math.round(w.points / w.max * 100)}%)` : "";
  const facts = [
    `Student: ${c.first} (${c.student}). Class: ${c.klass}. Report: ${c.cycle}. Teacher: ${c.teacher || "the class teacher"}.`,
    `Scores chosen by the teacher (1-5, 5 = exceeding): effort ${scores.effort ?? "not chosen yet"}, progress ${scores.progress ?? "not chosen yet"}.${c.gcse ? ` GCSE grades: working ${scores.working ?? "-"}, predicted ${scores.predicted ?? "-"}.` : ""}`,
    c.lessons ? `Attendance this term: ${c.att != null && c.att >= 95 ? "excellent" : c.att != null && c.att >= 85 ? "good" : "some lessons missed"} (${c.lessons} lessons registered).` : "",
    c.work.length ? `Classroom work this term:\n${c.work.map((w) => `- "${w.title}"${w.due ? `, due ${w.due}` : ""}: ${w.state === "returned" ? `marked${pct(w)}` : w.state === "turned_in" ? "handed in, not marked yet" : w.missing ? "not handed in" : "not due yet"}${w.late ? ", handed in late" : ""}${w.rubric ? `; rubric: ${JSON.stringify(w.rubric).slice(0, 400)}` : ""}`).join("\n")}` : "No Classroom work recorded this term.",
    c.rewards.length ? `Reward points from the teacher, with reasons:\n${c.rewards.map((r) => `- ${r.on}: +${r.points} for "${r.reason}"`).join("\n")}` : "",
    chat.length ? `Things ${c.first} wrote in the lesson chat (Google Meet) recently, as evidence of how they take part:\n${chat.map((l) => `- ${l.day}: "${l.text}"`).join("\n")}` : "",
    c.previous.length ? `Earlier reports:\n${c.previous.map((p) => `- ${p.cycle}, ${p.klass}${p.effort ? `, effort ${p.effort}` : ""}${p.working ? `, working grade ${p.working}` : ""}${p.predicted ? `, predicted ${p.predicted}` : ""}: "${p.comment.slice(0, 900)}"`).join("\n")}` : "No earlier reports.",
  ].filter(Boolean).join("\n\n");
  try {
    const res = await fetch(process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ai.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ai.model || "claude-sonnet-5-5", max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content: facts }] }), signal: AbortSignal.timeout(60000),
    });
    const j = await res.json().catch(() => ({})) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!res.ok) return { error: `Claude couldn’t draft it just now${j.error?.message ? `: ${j.error.message.slice(0, 120)}` : ""}.` };
    const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    return text ? { text: text.slice(0, 2000) } : { error: "Claude didn’t return a draft. Try again." };
  } catch { return { error: "Couldn’t reach Claude. Try again in a moment." }; }
}
