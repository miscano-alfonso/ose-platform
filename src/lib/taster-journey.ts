import "server-only";
import { withSchool } from "./db";
import { DEFS } from "./automations";

// 28 Nov: each taster's journey, step by step, for Admin → Tasters and the admin home. Everything here happens by
// itself: the emails are the automations (Admin → Marketing → Automations), the Classroom invitation is sent by the
// Classroom job, whether the child came is read from Google Meet, and what the family did next is worked out from the
// platform (taster_journey in db/133).

export type StepState = "done" | "wait" | "held" | "bad" | "off" | "skip" | "now";
export type Step = { key: string; label: string; state: StepState; note: string };
export type Outcome = "enrolled" | "waitlist" | "rebooked" | "replied" | "waiting" | "no_reply" | "upcoming" | "cancelled";
export type Journey = {
  id: string; child: string; child_email: string; parent: string; parent_email: string; cls: string; code: string; teacher: string | null;
  lesson_event_id: string; starts: string; ends: string; status: string; source: string; trial: boolean;
  steps: Step[]; outcome: Outcome; outcome_text: string; stage: string;
};

type Row = { id: string; child: string; child_email: string; parent: string; parent_email: string; cls: string; code: string; teacher: string | null; lesson_event_id: string;
  starts: string; ends: string; status: string; source: string; pushed: boolean; created: string; classroom: string | null; course: string | null; trial: boolean; was_trial: boolean;
  enrolled_at: string | null; enrolled_in: string | null; rebooked_at: string | null; waitlist_at: string | null; replied_at: string | null };
type Send = { key: string; ref: string; status: string; at: string };

const T = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).replace(",", "");
const D = (iso: string | number) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** Tasters with lessons from `days` ago onwards (and all upcoming), newest lesson first. */
export async function tasterJourneys(days = 120): Promise<Journey[]> {
  return withSchool(async (q) => {
    const rows = await q<Row>(`select b.id, r.child_name as child, r.child_email::text, r.parent_first_name || ' ' || r.parent_last_name as parent, r.parent_email::text,
        l.name || ' ' || sj.name as cls, g.code, u.name as teacher, b.lesson_event_id, tj.starts::text, tj.ends::text, b.status::text, r.source, r.push_id is not null as pushed, b.created_at::text as created,
        b.classroom_state as classroom, g.google_course_id as course, g.trial,
        (g.trial_ended_at is not null and e.lesson_date <= (g.trial_ended_at at time zone sc.timezone)::date) as was_trial,
        tj.enrolled_at::text, tj.enrolled_in, tj.rebooked_at::text, tj.waitlist_at::text, tj.replied_at::text
      from taster_bookings b join taster_journey tj on tj.id = b.id join taster_requests r on r.id = b.request_id join lesson_events e on e.id = b.lesson_event_id
        join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join schools sc on sc.id = b.school_id
        left join teachers t on t.id = e.teacher_id left join users u on u.id = t.user_id
      where e.lesson_date >= current_date - $1::int order by tj.starts desc`, [days]);
    if (!rows.length) return [];
    const sends = await q<Send>(`select key, ref, status, coalesce(scheduled_for, created_at)::text as at from automation_sends
      where key like 'taster%' and ref = any($1::text[]) order by created_at`, [rows.map((r) => r.id)]);
    const saved = await q<{ key: string; enabled: boolean; minutes: number | null }>(`select key, enabled, minutes from automations where key like 'taster%'`);
    const on = (key: string) => { const s = saved.find((x) => x.key === key); return s ? s.enabled : !!DEFS.find((d) => d.key === key)?.default_on; };
    const lastDays = (key: string) => saved.find((x) => x.key === key)?.minutes ?? 7;
    const now = Date.now();

    return rows.map((r): Journey => {
      const my = (key: string) => sends.filter((s) => s.ref === r.id && s.key === key);
      // one step from the sends of an automation: sent, booked for later, held by test mode, failed, or not yet
      const mail = (stepKey: string, label: string, keys: string[], notYet: string): Step => {
        const got = keys.flatMap(my);
        if (got.some((s) => s.status === "sent" || s.status === "included")) { const s = got.find((x) => x.status === "sent") ?? got[0]; return { key: stepKey, label, state: "done", note: `Sent ${T(s.at)}` }; }
        if (got.some((s) => s.status === "scheduled")) { const s = got.find((x) => x.status === "scheduled")!; return Date.parse(s.at) <= now ? { key: stepKey, label, state: "done", note: `Sent ${T(s.at)}` } : { key: stepKey, label, state: "wait", note: `Booked for ${T(s.at)}` }; }
        if (got.some((s) => s.status === "held")) return { key: stepKey, label, state: "held", note: "Held by test mode" };
        if (got.some((s) => s.status === "failed")) return { key: stepKey, label, state: "bad", note: "Didn’t send" };
        if (!keys.some(on)) return { key: stepKey, label, state: "off", note: "Automation switched off" };
        return { key: stepKey, label, state: "wait", note: notYet };
      };
      const start = Date.parse(r.starts), end = Date.parse(r.ends), cancelled = r.status === "cancelled";
      const enrolled = !!r.enrolled_at || r.status === "booked_course";
      const came = r.status === "attended" || r.status === "booked_course" ? true : r.status === "no_show" ? false : null;
      const answered = enrolled || !!r.rebooked_at || !!r.waitlist_at || !!r.replied_at;
      const steps: Step[] = [];
      steps.push({ key: "booked", label: "Booked", state: "done", note: `${D(r.created)} · ${r.pushed ? "from a Fill a class email" : r.source === "website" ? "on the website" : "by the office"}` });
      steps.push(mail("confirm", "Confirmed", ["taster_booked", "taster_student_welcome"], "Sends within a few minutes"));
      steps.push(r.classroom === "invited" ? { key: "classroom", label: "Classroom", state: "done", note: "Invited to the class" }
        : r.classroom === "removed" ? { key: "classroom", label: "Classroom", state: "done", note: "Invited, then taken out after 3 days" }
        : !r.course ? { key: "classroom", label: "Classroom", state: "skip", note: "Class isn’t linked to Google Classroom" }
        : Date.parse(r.ends) < Date.now() ? { key: "classroom", label: "Classroom", state: "off", note: "Wasn’t invited" }
        : { key: "classroom", label: "Classroom", state: "wait", note: "Invitation sends shortly" });
      steps.push(start < now && !my("taster_link").length ? { key: "reminder", label: "Reminder", state: "skip", note: "Booked too late for a reminder" }
        : mail("reminder", "Reminder", ["taster_link"], "Before the lesson"));
      steps.push(cancelled ? { key: "lesson", label: "Lesson", state: "bad", note: "Cancelled" }
        : came === true ? { key: "lesson", label: "Lesson", state: "done", note: `Came · ${D(r.starts)}` }
        : came === false ? { key: "lesson", label: "Lesson", state: "bad", note: `Didn’t come · ${D(r.starts)}` }
        : now < start ? { key: "lesson", label: "Lesson", state: "wait", note: T(r.starts) }
        : now < end ? { key: "lesson", label: "Lesson", state: "now", note: "On now" }
        : { key: "lesson", label: "Lesson", state: "wait", note: "Checking Google Meet" });
      const trialish = r.trial || r.was_trial;
      const firstKey = came === false ? "taster_missed" : trialish ? "trial_waitlist_invite" : "taster_follow_up";
      const finalKey = came === false ? "taster_missed_final" : "taster_follow_up_final";
      if (!cancelled) {
        steps.push(came === null ? { key: "follow", label: "Follow-up", state: "wait", note: "After the lesson" }
          : enrolled && !my(firstKey).length ? { key: "follow", label: "Follow-up", state: "skip", note: "Not needed: booked a course" }
          : mail("follow", came ? (trialish ? "Waiting list invite" : "Invite to enrol") : "Re-book offer", [firstKey], "A few hours after the lesson"));
        const first = my(firstKey).find((s) => ["sent", "scheduled", "held"].includes(s.status));
        steps.push(came === null || trialish && came ? { key: "last", label: "Last reminder", state: "skip", note: trialish && came ? "Trial class: the waiting list emails follow up" : "A week after the follow-up" }
          : my(finalKey).length ? mail("last", "Last reminder", [finalKey], "")
          : answered ? { key: "last", label: "Last reminder", state: "skip", note: "Not needed: they responded" }
          : !first ? { key: "last", label: "Last reminder", state: "wait", note: "A week after the follow-up" }
          : mail("last", "Last reminder", [finalKey], `Due ${D(Date.parse(first.at) + lastDays(finalKey) * 864e5)} if no reply`));
      }
      // where it ended up
      const finalSent = my(finalKey).find((s) => ["sent", "scheduled", "held"].includes(s.status));
      const firstSentRow = my(firstKey).find((s) => ["sent", "scheduled", "held"].includes(s.status)), firstAt = firstSentRow ? Date.parse(firstSentRow.at) : null;
      const [outcome, outcome_text]: [Outcome, string] = cancelled ? ["cancelled", "Cancelled"]
        : enrolled ? ["enrolled", r.enrolled_in ? `Enrolled: ${r.enrolled_in}` : "Booked a course"]
        : r.waitlist_at ? ["waitlist", `Joined the waiting list ${D(r.waitlist_at)}`]
        : r.rebooked_at ? ["rebooked", `Booked another taster ${D(r.rebooked_at)}`]
        : r.replied_at ? ["replied", `Replied by email ${D(r.replied_at)}`]
        : came === null ? ["upcoming", now < start ? "Lesson to come" : "Waiting for attendance"]
        // 28 Nov (Alfonso): a week after the last reminder with no response, they're "Not enrolled" (two weeks after the
        // first follow-up if the last reminder is switched off, so nobody waits for ever)
        : finalSent ? (Date.parse(finalSent.at) + 7 * 864e5 < now ? ["no_reply", "Not enrolled: no reply"] : ["waiting", "Waiting for the family"])
        : firstAt && !on(finalKey) && firstAt + 14 * 864e5 < now ? ["no_reply", "Not enrolled: no reply"]
        : ["waiting", "Waiting for the family"];
      steps.push({ key: "outcome", label: "Outcome", state: outcome === "enrolled" ? "done" : outcome === "no_reply" || outcome === "cancelled" ? "bad" : ["waitlist", "rebooked", "replied"].includes(outcome) ? "done" : "wait", note: outcome_text });
      const doneUpTo = [...steps].reverse().find((s) => s.state === "done" || s.state === "bad" || s.state === "now" || s.state === "held");
      const stage = outcome !== "upcoming" && outcome !== "waiting" ? outcome_text : doneUpTo ? `${doneUpTo.label}: ${doneUpTo.note}` : "Booked";
      return { id: r.id, child: r.child, child_email: r.child_email, parent: r.parent, parent_email: r.parent_email, cls: r.cls, code: r.code, teacher: r.teacher,
        lesson_event_id: r.lesson_event_id, starts: r.starts, ends: r.ends, status: r.status, source: r.source, trial: r.trial, steps, outcome, outcome_text, stage };
    });
  });
}

/** The numbers across the top: tasters in the last `days` days (by lesson date), how many came, and how many enrolled. */
export function tasterFunnel(list: Journey[], days = 90) {
  const from = Date.now() - days * 864e5, now = Date.now();
  const past = list.filter((j) => j.outcome !== "cancelled" && Date.parse(j.starts) >= from && Date.parse(j.ends) < now);
  const came = past.filter((j) => j.steps.find((s) => s.key === "lesson")?.state === "done");
  const enrolled = past.filter((j) => j.outcome === "enrolled");
  return {
    booked: past.length, came: came.length, enrolled: enrolled.length,
    rate: came.length ? Math.round((enrolled.length / came.length) * 100) : null,
    upcoming: list.filter((j) => j.outcome !== "cancelled" && Date.parse(j.ends) >= now).length,
    waiting: past.filter((j) => j.outcome === "waiting").length,
  };
}

export async function setTasterPlaces(n: number): Promise<void> {
  if (!Number.isInteger(n) || n < 0 || n > 10) return;
  await withSchool((q) => q(`update schools set taster_places_per_lesson = $1 where id = current_school()`, [n]));
}
