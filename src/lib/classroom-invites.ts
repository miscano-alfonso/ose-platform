import "server-only";
import { withSchool } from "./db";
import { googleAccess, googleKv, googleKvSet, recCanInvite, MeetError } from "./meet";

// Google Classroom invitations, sent by the site from the recordings account (ose@, a teacher on every class):
//  - a student whose place is confirmed (paid, or added by the office) is invited to that class's Classroom, at the
//    Google account the parent gave for them; Google emails the invitation and the student presses Join.
//  - a student whose place ends (cancelled, swapped to another class, or a taster that didn't go on to book)
//    is taken out of the Classroom, or their unanswered invitation is withdrawn.
// Completed courses are left alone, so students keep their work. Students the site never enrolled are never touched.
const API = () => process.env.CLASSROOM_API_URL || "https://classroom.googleapis.com/v1";

export type InviteCfg = { auto: boolean };
export type InviteRun = { at?: string; by?: string; invited?: number; removed?: number; problems?: string[]; error?: string };
export type ToInvite = { student_id: string; group_id: string; student: string; email: string; class: string; code: string; course: string; membership_id: string | null; old_invite: string | null };
export type ToRemove = { membership_id: string; student: string; email: string | null; class: string; code: string; course: string; state: string; invite_id: string | null; why: string };
export type NoEmail = { student: string; class: string; parent: string };
export type InvitePlan = { invite: ToInvite[]; remove: ToRemove[]; noEmail: NoEmail[]; noClassroom: string[] };

export async function inviteCfg(): Promise<InviteCfg> { return { auto: false, ...((await googleKv<InviteCfg>("classroom_invites")) ?? {}) }; }
export async function saveInviteCfg(auto: boolean) { await googleKvSet("classroom_invites", { auto } satisfies InviteCfg); }

// A place is confirmed once it's active, or booked and paid (or added by the office, with no order).
const LIVE = `select e.student_id, e.group_id, e.is_taster from enrolments e left join orders o on o.id = e.order_id
  where e.status = 'active' or (e.status = 'pending' and (e.order_id is null or o.status = 'paid'))`;
const THIS_YEAR = `g.academic_year_id in (select id from academic_years where ends_on >= current_date)`;

export async function invitePlan(): Promise<InvitePlan> {
  return withSchool(async (q) => {
    const invite = await q<ToInvite>(`with live as (${LIVE})
      select s.id as student_id, g.id as group_id, s.first_name || ' ' || s.last_name as student, lower(s.email::text) as email,
        l.name || ' ' || sj.name as class, g.code, g.google_course_id as course, m.id as membership_id,
        case when m.state = 'invited' then m.google_invitation_id end as old_invite
      from live join students s on s.id = live.student_id join course_groups g on g.id = live.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join classroom_memberships m on m.group_id = g.id and m.student_id = s.id
      where ${THIS_YEAR} and g.google_course_id is not null and s.email is not null and s.email <> ''
        and (m.id is null or m.state = 'removed' or (m.state = 'invited' and m.invited_email is not null and m.invited_email <> s.email))
      order by g.code, s.first_name`);
    const remove = await q<ToRemove>(`with live as (${LIVE})
      select m.id as membership_id, s.first_name || ' ' || s.last_name as student, lower(s.email::text) as email, l.name || ' ' || sj.name as class, g.code,
        g.google_course_id as course, m.state::text as state, m.google_invitation_id as invite_id,
        (select case when e.status = 'swapped' then 'Moved to another class' when e.is_taster then 'Taster, didn’t book' else 'Place cancelled' end
           from enrolments e where e.group_id = m.group_id and e.student_id = m.student_id order by coalesce(e.ended_at, e.enrolled_at) desc limit 1) as why
      from classroom_memberships m join students s on s.id = m.student_id join course_groups g on g.id = m.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where m.state in ('invited', 'joined') and ${THIS_YEAR} and g.google_course_id is not null
        and not exists (select 1 from live where live.group_id = m.group_id and live.student_id = m.student_id)
        and exists (select 1 from enrolments e where e.group_id = m.group_id and e.student_id = m.student_id
          and (e.status in ('cancelled', 'swapped') or (e.is_taster and e.status = 'completed')))
      order by g.code, s.first_name`);
    const noEmail = await q<NoEmail>(`with live as (${LIVE})
      select s.first_name || ' ' || s.last_name as student, l.name || ' ' || sj.name as class, p.first_name || ' ' || p.last_name as parent
      from live join students s on s.id = live.student_id join parents p on p.id = s.parent_id join course_groups g on g.id = live.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join classroom_memberships m on m.group_id = g.id and m.student_id = s.id
      where ${THIS_YEAR} and g.google_course_id is not null and (s.email is null or s.email = '') and (m.id is null or m.state <> 'joined')
      order by s.first_name`);
    const noClassroom = (await q<{ code: string }>(`with live as (${LIVE}) select distinct g.code from live join course_groups g on g.id = live.group_id
      where ${THIS_YEAR} and g.google_course_id is null and g.status <> 'closed' order by g.code`)).map((r) => r.code);
    return { invite, remove, noEmail, noClassroom };
  });
}

type GErr = { error?: { message?: string; status?: string } };
async function call(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API() + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const j = (await r.json().catch(() => ({}))) as GErr & Record<string, unknown>;
  return { status: r.status, j };
}
/** Plain-English reason Google gave for refusing an invitation. */
function why(status: number, j: GErr, email: string): string {
  const m = j.error?.message ?? "";
  if (status === 404) return `Google couldn’t find ${email} as a Google account (or couldn’t find the class). Check the address with the parent, and the class’s Classroom link.`;
  if (status === 403 && /domain|IllegalDomain/i.test(m)) return `Google Workspace won’t let ${email} join classes from your domain. In the Google Admin console allow students from other domains in Classroom.`;
  if (status === 403) return "ose@ isn’t allowed to invite to this class: make sure ose@ is a teacher on it.";
  if (status === 400) return `Google turned down ${email}${m ? `: ${m.slice(0, 140)}` : "."}`;
  return `Classroom answered ${status}${m ? `: ${m.slice(0, 140)}` : ""}.`;
}

/** Send the invitations and withdrawals in the plan. */
export async function runInvites(by: string): Promise<InviteRun> {
  const run: InviteRun = { at: new Date().toISOString(), by, invited: 0, removed: 0, problems: [] };
  const ready = await recCanInvite();
  if (ready !== "ok") { run.error = ready === "none" ? "Connect the recordings account (ose@) first, under Recordings → Settings." : "Connect ose@ again (Recordings → Settings) so the site may send Classroom invitations."; await googleKvSet("classroom_invites_run", run); return run; }
  let token: string;
  try { token = await googleAccess("rec"); } catch (e) { run.error = e instanceof MeetError ? e.message : "Couldn’t reach Google."; await googleKvSet("classroom_invites_run", run); return run; }
  const plan = await invitePlan();
  let refused = 0;
  for (const x of plan.invite) {
    if (x.old_invite) await call(token, "DELETE", `/invitations/${encodeURIComponent(x.old_invite)}`);   // the parent changed the address: withdraw the old one
    const r = await call(token, "POST", "/invitations", { courseId: x.course, userId: x.email, role: "STUDENT" });
    if (r.status !== 200 && r.status !== 409) {   // 409: already invited, or already in the class (the next Classroom sync marks them joined)
      run.problems!.push(`${x.student}, ${x.code}: ${why(r.status, r.j, x.email)}`);   // tried again next time
      if (r.status === 401 || (r.status === 403 && ++refused >= 3 && run.invited === 0)) break;   // no access at all: stop early
      continue;
    }
    run.invited!++;
    await withSchool((q) => q(`insert into classroom_memberships (school_id, group_id, student_id, state, google_invitation_id, invited_email, invited_at)
        values (current_school(), $1, $2, 'invited', $3, $4, now())
      on conflict (group_id, student_id) do update set state = 'invited', joined_at = null, removed_at = null, google_invitation_id = excluded.google_invitation_id,
        invited_email = excluded.invited_email, invited_at = now(), emailed_at = null, last_reminded_at = null`,
      [x.group_id, x.student_id, r.status === 200 ? String(r.j.id ?? "") || null : null, x.email]));
  }
  for (const x of plan.remove) {
    const course = encodeURIComponent(x.course); let ok = true;
    if (x.state === "invited") {
      const ids = x.invite_id ? [x.invite_id] : x.email
        ? (((await call(token, "GET", `/invitations?courseId=${course}&userId=${encodeURIComponent(x.email)}`)).j.invitations as { id: string }[] | undefined) ?? []).map((i) => i.id) : [];
      for (const id of ids) { const r = await call(token, "DELETE", `/invitations/${encodeURIComponent(id)}`); if (r.status !== 200 && r.status !== 404) ok = false; }
    }
    if (x.email) {   // in the class (or accepted since we last looked): take them out
      const r = await call(token, "DELETE", `/courses/${course}/students/${encodeURIComponent(x.email)}`);
      if (r.status !== 200 && r.status !== 404) { ok = false; run.problems!.push(`${x.student}, ${x.code}: couldn’t take them out of the Classroom (${r.status}).`); }
    }
    if (!ok) continue;
    run.removed!++;
    await withSchool((q) => q(`update classroom_memberships set state = 'removed', joined_at = null, removed_at = now() where id = $1`, [x.membership_id]));
  }
  await googleKvSet("classroom_invites_run", run);
  return run;
}

export async function inviteStatus() {
  const [ready, cfg, last] = await Promise.all([recCanInvite(), inviteCfg(), googleKv<InviteRun>("classroom_invites_run")]);
  return { ready, cfg, last: last ?? {} };
}

/** Every hour or so (cron, or when the admin is opened), if switched on. */
export async function invitesBackground() {
  try {
    const { ready, cfg, last } = await inviteStatus();
    if (!cfg.auto || ready !== "ok") return;
    if (last.at && last.by === "auto" && Date.now() - Date.parse(last.at) < 3600e3) return;
    await googleKvSet("classroom_invites_run", { ...last, at: new Date().toISOString(), by: "auto" });
    await runInvites("auto");
  } catch (e) { console.error("classroom invites background", e); }
}
