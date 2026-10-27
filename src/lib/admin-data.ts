import "server-only";
import { withSchool } from "./db";

// The year shown in the admin: the one running today, else the next one to start.
const YEAR = `(select id from academic_years where school_id = current_school()
   order by (current_date between starts_on and ends_on) desc, starts_on >= current_date desc, starts_on limit 1)`;

export type DashTiles = {
  year_label: string; term_name: string | null;
  students: number; families: number; taken: number; capacity: number;
  collected: number; next_bills_on: string | null; next_term: string | null; next_amount: number; next_families: number;
  failed_count: number; failed_amount: number; enquiries_open: number; waiting: number;
};
export type Attention = { kind: "failed" | "full" | "almost" | "enquiry" | "waitlist"; title: string; detail: string; href: string };

export async function getDashboard(): Promise<{ t: DashTiles; attention: Attention[] }> {
  return withSchool(async (q) => {
    const [t] = await q<DashTiles>(`
      with y as (select * from academic_years where id = ${YEAR}),
      live as (select e.* from enrolments e join course_groups g on g.id = e.group_id where g.academic_year_id = (select id from y) and e.status in ('pending','active')),
      nt as (select * from terms where academic_year_id = (select id from y) and bills_on >= current_date order by bills_on limit 1),
      yi as (select i.* from instalments i join terms t on t.id = i.term_id where t.academic_year_id = (select id from y))
      select (select label from y) as year_label,
        (select name from terms where academic_year_id = (select id from y) and current_date between starts_on and ends_on) as term_name,
        (select count(distinct student_id)::int from live) as students,
        (select count(distinct s.parent_id)::int from live join students s on s.id = live.student_id) as families,
        (select coalesce(sum(a.taken),0)::int from course_group_availability a join course_groups g on g.id = a.group_id
          where g.academic_year_id = (select id from y) and g.status in ('open','priority') and g.capacity is not null) as taken,
        (select coalesce(sum(g.capacity),0)::int from course_groups g where g.academic_year_id = (select id from y) and g.status in ('open','priority') and g.capacity is not null) as capacity,
        (select coalesce(sum(amount_pence - refunded_pence),0)::int from yi where status in ('paid','part_refunded')) as collected,
        (select to_char(bills_on,'YYYY-MM-DD') from nt) as next_bills_on, (select name from nt) as next_term,
        (select coalesce(sum(amount_pence),0)::int from yi where term_id = (select id from nt) and status = 'scheduled') as next_amount,
        (select count(distinct s.parent_id)::int from yi join enrolments e on e.id = yi.enrolment_id join students s on s.id = e.student_id
          where yi.term_id = (select id from nt) and yi.status = 'scheduled') as next_families,
        (select count(*)::int from instalments where status = 'failed') as failed_count,
        (select coalesce(sum(amount_pence),0)::int from instalments where status = 'failed') as failed_amount,
        (select count(*)::int from enquiries where handled_at is null) as enquiries_open,
        (select count(*)::int from waitlist_entries where enrolled_at is null) as waiting`);
    const failed = await q<Attention>(`
      select 'failed' as kind, p.first_name || ' ' || p.last_name || ': £' || to_char(i.amount_pence / 100.0, 'FM999,990.00') as title,
             s.first_name || ', ' || l.name || ' ' || sj.name || ' · ' || t.name as detail, '/admin/classes' as href
      from instalments i join enrolments e on e.id = i.enrolment_id join students s on s.id = e.student_id join parents p on p.id = s.parent_id
      join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join terms t on t.id = i.term_id
      where i.status = 'failed' order by i.due_on limit 20`);
    const classes = await q<Attention>(`
      select case when a.is_full then 'full' else 'almost' end as kind, l.name || ' ' || sj.name || ' (' || g.code || ')' as title,
             case when a.is_full then 'Full: ' || a.taken || ' of ' || g.capacity || ' places' || case when a.waiting > 0 then ' · ' || a.waiting || ' waiting' else '' end
                  else a.places_left || ' place' || case when a.places_left = 1 then '' else 's' end || ' left' end as detail, '/admin/classes' as href
      from course_group_availability a join course_groups g on g.id = a.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where g.academic_year_id = ${YEAR} and g.status in ('open','priority') and (a.is_full or a.label = 'Almost full')
      order by a.places_left nulls first`);
    const enq = await q<Attention>(`
      select 'enquiry' as kind, name || ' · ' || initcap(kind) as title, coalesce(left(message, 90), 'No message') || ' · ' || to_char(created_at, 'DD Mon') as detail, '/admin/enquiries' as href
      from enquiries where handled_at is null order by created_at desc limit 10`);
    const wl = await q<Attention>(`
      select 'waitlist' as kind, l.name || ' ' || sj.name || ' (' || g.code || ')' as title, a.waiting || ' on the waiting list · opens at ' || g.waitlist_threshold as detail, '/admin/enquiries' as href
      from course_group_availability a join course_groups g on g.id = a.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where a.waiting > 0 order by a.waiting desc limit 10`);
    return { t, attention: [...failed, ...classes, ...enq, ...wl] };
  });
}

export type AdminGroup = { homepage: string; homepage_order: number | null; bookable: boolean; meet_url: string | null; classroom: boolean;
  id: string; code: string; level: string; subject: string; colour: string; teacher: string | null; year_label: string;
  status: string; capacity: number | null; capacity_mode: string; sticky_label: string; taken: number; places_left: number | null;
  is_full: boolean; waiting: number; label: string | null; slots: string | null; waitlist_threshold: number;
};
export async function getGroups(): Promise<AdminGroup[]> {
  return withSchool((q) => q<AdminGroup>(`
    select g.id, g.code, l.name as level, sj.name as subject, coalesce(sj.colour,'#8494c2') as colour, u.name as teacher, y.label as year_label,
           g.status::text, g.capacity, g.capacity_mode::text, g.sticky_label::text, g.homepage, g.homepage_order, g.meet_url, g.google_course_id is not null as classroom, a.bookable, a.taken, a.places_left, a.is_full, a.waiting, a.label, g.waitlist_threshold,
           (select string_agg(case s.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end
              || ' ' || to_char(s.starts_at,'HH24:MI'), ', ' order by s.weekday, s.starts_at) from lesson_slots s where s.group_id = g.id) as slots
    from course_groups g join course_group_availability a on a.group_id = g.id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    join academic_years y on y.id = g.academic_year_id left join teachers t on t.id = g.teacher_id left join users u on u.id = t.user_id
    where y.ends_on >= current_date
    order by y.starts_on, l.sort_order, sj.name, g.code`));
}

export type AdminWorkshop = { id: string; title: string; starts_at: string; minutes: number; price_pence: number; capacity: number | null; status: string; booked: number; teacher: string | null };
export async function getWorkshopsAdmin(): Promise<AdminWorkshop[]> {
  return withSchool((q) => q<AdminWorkshop>(`
    select w.id, w.title, w.starts_at::text, w.minutes, w.price_pence, w.capacity, w.status::text, u.name as teacher,
           (select count(*)::int from workshop_bookings b where b.workshop_id = w.id and b.status <> 'cancelled') as booked
    from workshops w left join teachers t on t.id = w.teacher_id left join users u on u.id = t.user_id
    order by w.starts_at desc`));
}

export type Enquiry = { id: string; kind: string; name: string; email: string; levels: string[]; heard_about: string | null; message: string | null; created_at: string; handled_at: string | null };
export type WaitEntry = { id: string; parent_name: string; child_name: string; email: string; created_at: string; emailed_at: string | null; class: string };
export async function getEnquiries(): Promise<{ enquiries: Enquiry[]; waiting: WaitEntry[] }> {
  return withSchool(async (q) => ({
    enquiries: await q<Enquiry>(`select id, kind, name, email::text, levels, heard_about, message, created_at::text, handled_at::text
      from enquiries order by handled_at is not null, created_at desc limit 200`),
    waiting: await q<WaitEntry>(`select w.id, w.parent_name, w.child_name, w.email::text, w.created_at::text, w.emailed_at::text,
        coalesce(l.name || ' ' || sj.name || ' (' || g.code || ')', l2.name || ' ' || sj2.name, 'Any class') as class
      from waitlist_entries w left join course_groups g on g.id = w.group_id left join levels l on l.id = g.level_id left join subjects sj on sj.id = g.subject_id
      left join levels l2 on l2.id = w.level_id left join subjects sj2 on sj2.id = w.subject_id
      where w.enrolled_at is null order by class, w.created_at`),
  }));
}

export type AdminTerm = { year_label: string; number: number; name: string; starts_on: string; ends_on: string; bills_on: string; sales_open_on: string };
export async function getTermsAdmin(): Promise<AdminTerm[]> {
  return withSchool((q) => q<AdminTerm>(`
    select y.label as year_label, t.number, t.name, t.starts_on::text, t.ends_on::text, t.bills_on::text, y.sales_open_on::text
    from terms t join academic_years y on y.id = t.academic_year_id where y.ends_on >= current_date order by y.starts_on, t.number`));
}

export type AdminPlan = { year_label: string; level: string; name: string; course_years: number; year_of_course: number; lessons_per_week: number; term_count: number; lessons: number; cost_per_lesson_pence: number; total_pence: number; registration_fee_pence: number };
export type AdminBundle = { year_label: string; level: string | null; min_courses: number; percent_off: string };
export async function getPricesAdmin(): Promise<{ plans: AdminPlan[]; bundles: AdminBundle[] }> {
  return withSchool(async (q) => ({
    plans: await q<AdminPlan>(`select y.label as year_label, l.name as level, pp.name, pp.course_years, pp.year_of_course, pp.lessons_per_week, pp.term_count,
        pp.lessons, pp.cost_per_lesson_pence, pp.total_pence, pp.registration_fee_pence
      from price_plans pp join levels l on l.id = pp.level_id join academic_years y on y.id = pp.academic_year_id
      where y.ends_on >= current_date order by y.starts_on, l.sort_order, pp.course_years, pp.year_of_course, pp.lessons_per_week`),
    bundles: await q<AdminBundle>(`select y.label as year_label, l.name as level, b.min_courses, b.percent_off::text
      from bundle_discounts b join academic_years y on y.id = b.academic_year_id left join levels l on l.id = b.level_id
      where y.ends_on >= current_date order by y.starts_on, b.min_courses`),
  }));
}

export type StaffRow = { id: string; name: string; email: string; role: string; active: boolean; disabled: boolean; last_sign_in_at: string | null; teaches: string | null };
export type InviteRow = { id: string; name: string; email: string; role: string; created_at: string; expires_at: string; expired: boolean; invited_by: string | null };
export type TeacherOption = { id: string; name: string; email: string; has_account: boolean };
export async function getStaff(): Promise<{ staff: StaffRow[]; invites: InviteRow[]; teachers: TeacherOption[] }> {
  return withSchool(async (q) => ({
    staff: await q<StaffRow>(`select u.id, u.name, u.email::text, u.role::text, u.password_hash is not null and u.disabled_at is null as active,
        u.disabled_at is not null as disabled, u.last_sign_in_at::text,
        (select string_agg(distinct g.code, ', ') from teachers t join course_groups g on g.teacher_id = t.id where t.user_id = u.id) as teaches
      from users u where u.role in ('school_admin','teacher') and (u.password_hash is not null or u.disabled_at is not null)
      order by u.role, u.name`),
    invites: await q<InviteRow>(`select i.id, i.name, i.email::text, i.role::text, i.created_at::text, i.expires_at::text, i.expires_at < now() as expired, u.name as invited_by
      from staff_invites i left join users u on u.id = i.invited_by where i.accepted_at is null and i.revoked_at is null order by i.created_at desc`),
    teachers: await q<TeacherOption>(`select t.id, u.name, u.email::text, u.password_hash is not null as has_account
      from teachers t join users u on u.id = t.user_id where t.archived_at is null order by u.name`),
  }));
}

export type FamilyCourse = { id: string; code: string; name: string; status: string; needs_check: boolean; note: string | null; enrolled_on: string };
export type FamilyChild = { id: string; name: string; email: string | null; courses: FamilyCourse[] };
export type FamilyRow = { id: string; name: string; email: string; phone: string | null; note: string | null; children: FamilyChild[]; checks: number };
export async function getFamilies(): Promise<FamilyRow[]> {
  return withSchool((q) => q<FamilyRow>(`
    select p.id, p.first_name || ' ' || p.last_name as name, p.email::text, p.phone, p.admin_note as note,
      coalesce((select json_agg(json_build_object('id', s.id, 'name', s.first_name || ' ' || s.last_name, 'email', s.email,
          'courses', coalesce((select json_agg(json_build_object('id', e.id, 'code', g.code, 'name', l.name || ' ' || sj.name, 'status', e.status,
              'needs_check', e.needs_check, 'note', e.admin_note, 'enrolled_on', to_char(e.enrolled_at, 'YYYY-MM-DD')) order by l.sort_order, sj.name)
            from enrolments e join course_groups g on g.id = e.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
            where e.student_id = s.id), '[]')) order by s.first_name) from students s where s.parent_id = p.id), '[]') as children,
      (select count(*)::int from enrolments e join students s on s.id = e.student_id where s.parent_id = p.id and e.needs_check) as checks
    from parents p order by p.last_name, p.first_name`));
}

// ---------- dashboard extras (as in the prototype): attendance, collections by term, bookings, what's coming up, fullest classes ----------
export type DashMore = {
  att: { pct: number | null; low: { name: string; level: string; pct: number; att: number; held: number }[] };
  byTerm: { number: number; name: string; bills_on: string; billed: number; paid: number; failed: number }[];
  recent: { student: string; course: string; parent: string; on: string; amount: number; parent_id: string }[];
  coming: { kind: string; title: string; detail: string; href?: string }[];
  fullest: { name: string; colour: string; taken: number; capacity: number }[];
  clashes: { title: string; detail: string }[];
  term: { name: string; starts_on: string; ends_on: string } | null;
  /** lessons on the next teaching day (today if there are any), with London time now */
  day: { date: string; today: boolean; now: string; lessons: { starts: string; ends: string; name: string; code: string; colour: string; teacher: string | null; meet: string | null; status: string; students: number }[] };
};
export async function getDashboardMore(lowPct = 50): Promise<DashMore> {
  return withSchool(async (q) => {
    const term = (await q<{ id: string; name: string; starts_on: string; ends_on: string }>(`select id, name, starts_on::text, ends_on::text from terms where academic_year_id = ${YEAR}
      order by (current_date between starts_on and ends_on) desc, (starts_on > current_date), starts_on desc limit 1`))[0];
    // attendance this term, from the marks (Google Meet); approved absences don't count against it
    const per = term ? await q<{ name: string; level: string; att: number; held: number }>(`
      select s.first_name || ' ' || s.last_name as name, min(l.name) as level,
        count(*) filter (where m.mark in ('present','late'))::int as att, count(*) filter (where m.mark <> 'approved_absence')::int as held
      from attendance_marks m join lesson_events ev on ev.id = m.lesson_event_id join students s on s.id = m.student_id
      join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id
      where ev.term_id = $1 group by s.id, s.first_name, s.last_name`, [term.id]) : [];
    const tot = per.reduce((a, x) => a + x.held, 0);
    const att = { pct: tot ? Math.round(per.reduce((a, x) => a + x.att, 0) / tot * 100) : null,
      low: per.filter((x) => x.held >= 3 && x.att / x.held * 100 < lowPct).map((x) => ({ ...x, pct: Math.round(x.att / x.held * 100) })).sort((a, b) => a.pct - b.pct) };
    const byTerm = await q<DashMore["byTerm"][number]>(`select t.number, t.name, t.bills_on::text,
        coalesce(sum(i.amount_pence) filter (where i.status not in ('cancelled','refunded')),0)::int as billed,
        coalesce(sum(i.amount_pence - i.refunded_pence) filter (where i.status in ('paid','part_refunded')),0)::int as paid,
        coalesce(sum(i.amount_pence) filter (where i.status = 'failed'),0)::int as failed
      from terms t left join instalments i on i.term_id = t.id where t.academic_year_id = ${YEAR} group by t.id order by t.number`);
    const recent = await q<DashMore["recent"][number]>(`select s.first_name || ' ' || s.last_name as student, l.name || ' ' || sj.name as course,
        p.first_name || ' ' || p.last_name as parent, p.id as parent_id, e.enrolled_at::date::text as on, (e.list_price_pence - e.discount_pence)::int as amount
      from enrolments e join students s on s.id = e.student_id join parents p on p.id = s.parent_id join course_groups g on g.id = e.group_id
      join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where e.status in ('pending','active') and not e.is_taster order by e.enrolled_at desc limit 5`);
    const coming: DashMore["coming"] = [];
    const dm = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const nt = (await q<{ name: string; bills_on: string; n: number; amount: number; fams: number }>(`select t.name, t.bills_on::text, count(i.id)::int as n, coalesce(sum(i.amount_pence),0)::int as amount,
        count(distinct s.parent_id)::int as fams from terms t left join instalments i on i.term_id = t.id and i.status = 'scheduled'
        left join enrolments e on e.id = i.enrolment_id left join students s on s.id = e.student_id
      where t.academic_year_id = ${YEAR} and t.bills_on >= current_date group by t.id order by t.bills_on limit 1`))[0];
    if (nt && nt.n) {
      coming.push({ kind: "info", title: `Payment reminders · before ${dm(nt.bills_on)}`, detail: `${nt.fams} families told about the ${nt.name} charge before it’s taken` });
      coming.push({ kind: "info", title: `Charge run · ${dm(nt.bills_on)}`, detail: `${nt.n} instalments, £${(nt.amount / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, href: "/admin/payments" });
    } else coming.push({ kind: "mute", title: "No charges scheduled", detail: "Payments start when families enrol (or when the import’s schedules are created)" });
    if (term) {
      const end = new Date(term.ends_on + "T12:00:00Z"), dow = end.getUTCDay(); // Friday after the last day of term
      end.setUTCDate(end.getUTCDate() + (dow < 5 ? 5 - dow : 12 - dow)); const payday = end.toISOString().slice(0, 10);
      coming.push({ kind: "info", title: `Teacher pay · ${dm(payday)}`, detail: `Lessons taught in ${term.name}, paid the Friday after the term ends`, href: "/admin/payroll" });
    }
    const hol = (await q<{ name: string; starts_on: string; ends_on: string }>(`select name, starts_on::text, ends_on::text from holidays where ends_on >= current_date order by starts_on limit 1`))[0];
    if (hol) coming.push({ kind: "mute", title: hol.name, detail: `${dm(hol.starts_on)} to ${dm(hol.ends_on)}: no lessons, no reminders` });
    const fullest = await q<DashMore["fullest"][number]>(`select l.name || ' ' || sj.name as name, coalesce(sj.colour,'#8494c2') as colour, a.taken::int, g.capacity::int
      from course_group_availability a join course_groups g on g.id = a.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      where g.academic_year_id = ${YEAR} and g.capacity is not null and g.status in ('open','priority') order by a.taken::float / g.capacity desc, l.sort_order limit 10`);
    // a student booked into two lessons at the same time
    const clashes = await q<DashMore["clashes"][number]>(`
      select la.name || ' ' || sa.name || ' and ' || lb.name || ' ' || sb.name as title,
        (array['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[a.weekday + 1] || ' ' || to_char(a.starts_at,'HH24:MI') || ' · ' || count(distinct ea.student_id) || ' student' || case when count(distinct ea.student_id) > 1 then 's' else '' end || ' take both' as detail
      from lesson_slots a join lesson_slots b on b.weekday = a.weekday and b.academic_year_id = a.academic_year_id and b.group_id > a.group_id and a.minutes && b.minutes
      join enrolments ea on ea.group_id = a.group_id and ea.status in ('pending','active') and not ea.allow_clash
      join enrolments eb on eb.group_id = b.group_id and eb.student_id = ea.student_id and eb.status in ('pending','active') and not eb.allow_clash
      join course_groups ga on ga.id = a.group_id join levels la on la.id = ga.level_id join subjects sa on sa.id = ga.subject_id
      join course_groups gb on gb.id = b.group_id join levels lb on lb.id = gb.level_id join subjects sb on sb.id = gb.subject_id
      where a.academic_year_id = ${YEAR}
      group by la.name, sa.name, lb.name, sb.name, a.weekday, a.starts_at limit 10`);
    const nowL = (await q<{ d: string; t: string }>(`select (now() at time zone 'Europe/London')::date::text as d, to_char(now() at time zone 'Europe/London','HH24:MI') as t`))[0];
    const dayRow = (await q<{ d: string }>(`select min(lesson_date)::text as d from lesson_events where lesson_date >= $1::date and status <> 'cancelled'`, [nowL.d]))[0];
    const lessons = dayRow?.d ? await q<DashMore["day"]["lessons"][number]>(`select to_char(sl.starts_at,'HH24:MI') as starts, to_char(sl.ends_at,'HH24:MI') as ends,
        l.name || ' ' || sj.name as name, g.code, coalesce(sj.colour,'#8494c2') as colour, u.name as teacher, g.meet_url as meet, ev.status::text as status,
        (select count(*)::int from enrolments e where e.group_id = g.id and e.status in ('pending','active') and not e.is_taster) as students
      from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id join course_groups g on g.id = ev.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
      left join teachers t on t.id = coalesce(ev.teacher_id, sl.teacher_id) left join users u on u.id = t.user_id
      where ev.lesson_date = $1::date order by sl.starts_at, l.sort_order`, [dayRow.d]) : [];
    const day = { date: dayRow?.d ?? nowL.d, today: dayRow?.d === nowL.d, now: nowL.t, lessons };
    return { att, byTerm, recent, coming, fullest, clashes, term: term ? { name: term.name, starts_on: term.starts_on, ends_on: term.ends_on } : null, day };
  });
}

export type PendingInvite = { id: string; student: string; email: string | null; class: string; invited_at: string; reminded: string | null; next: string | null };
/** Students who haven't accepted their Google Classroom invitation yet (they can't join the Meet until they do). */
export async function pendingInvites(): Promise<PendingInvite[]> {
  return withSchool((q) => q<PendingInvite>(`select m.id, s.first_name || ' ' || s.last_name as student, s.email::text, l.name || ' ' || sj.name as class,
      m.invited_at::date::text as invited_at, m.last_reminded_at::date::text as reminded,
      (select to_char(ev.lesson_date, 'Dy DD Mon') || ' ' || to_char(sl.starts_at, 'HH24:MI') from lesson_events ev join lesson_slots sl on sl.id = ev.slot_id
        where ev.group_id = g.id and ev.lesson_date >= current_date and ev.status = 'scheduled' order by ev.lesson_date, sl.starts_at limit 1) as next
    from classroom_memberships m join students s on s.id = m.student_id join course_groups g on g.id = m.group_id join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id
    join enrolments e on e.group_id = m.group_id and e.student_id = m.student_id and e.status = 'active'
    where m.state = 'invited' and g.academic_year_id = (select id from academic_years where ends_on >= current_date order by starts_on limit 1)
    order by m.invited_at, s.first_name`));
}
/** Remind a student (and their parent) to accept the Google Classroom invitation. */
export async function remindInvite(actorId: string, id: string): Promise<string | null> {
  const { sendHtml } = await import("./email");
  const r = (await withSchool((q) => q<{ first: string; email: string | null; parent: string; pemail: string; class: string; school: string }>(`select s.first_name as first, s.email::text,
      p.first_name as parent, p.email::text as pemail, l.name || ' ' || sj.name as class, sc.name as school
    from classroom_memberships m join students s on s.id = m.student_id join parents p on p.id = s.parent_id join course_groups g on g.id = m.group_id
    join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join schools sc on sc.id = m.school_id where m.id = $1`, [id])))[0];
  if (!r) return "That invitation wasn’t found.";
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const sent = await sendHtml(`${r.first}: please accept the ${r.class} Google Classroom invitation`, `<p>Hello ${esc(r.first)} (and ${esc(r.parent)}),</p>
    <p>${esc(r.first)} has been invited to the <b>${esc(r.class)}</b> Google Classroom${r.email ? ` at ${esc(r.email)}` : ""}. Please open <a href="https://classroom.google.com/">classroom.google.com</a> signed in with that Google account and press <b>Join</b>. Until then ${esc(r.first)} can’t join the lesson’s Google Meet.</p>
    <p>Best wishes,<br>${esc(r.school)}</p>`, [r.email, r.pemail].filter(Boolean) as string[], "classroom-reminder");
  if (!sent.ok) return sent.error ?? "Couldn’t send the reminder.";
  await withSchool(async (q) => {
    await q(`update classroom_memberships set last_reminded_at = now() where id = $1`, [id]);
    await q(`insert into audit_log (school_id, actor_user_id, action, entity, entity_id, detail) values (current_school(), $1, 'remind', 'classroom_membership', $2, '{}')`, [actorId, id]);
  });
  return null;
}

export type WaitGroup = { id: string | null; name: string; colour: string; status: string; threshold: number; priority_until: string | null; priority_hours: number;
  entries: { id: string; parent: string; child: string; email: string; joined: string; emailed: string | null; booked: string | null }[] };
/** The prototype's waiting-list cards: one per class collecting sign-ups or in its priority window, plus "any class" sign-ups by course. */
export async function waitingGroups(): Promise<WaitGroup[]> {
  return withSchool(async (q) => {
    await q(`select open_expired_priority()`).catch(() => null);
    const ent = `coalesce((select json_agg(json_build_object('id', w.id, 'parent', w.parent_name, 'child', w.child_name, 'email', w.email, 'joined', w.created_at::date,
        'emailed', w.emailed_at::date, 'booked', w.enrolled_at::date) order by w.created_at) from waitlist_entries w where %W), '[]')`;
    const groups = await q<WaitGroup>(`select g.id, l.name || ' ' || sj.name || ' (' || g.code || ')' as name, coalesce(sj.colour,'#8494c2') as colour, g.status::text,
        g.waitlist_threshold as threshold, g.priority_until::text, g.priority_hours, ${ent.replace("%W", "w.group_id = g.id")} as entries
      from course_groups g join levels l on l.id = g.level_id join subjects sj on sj.id = g.subject_id join academic_years y on y.id = g.academic_year_id
      where y.ends_on >= current_date and (g.status in ('waitlist','priority') or exists (select 1 from waitlist_entries w where w.group_id = g.id and w.enrolled_at is null))
      order by g.status = 'priority' desc, l.sort_order, sj.name`);
    const loose = await q<WaitGroup>(`select null as id, coalesce(l.name, 'Any level') || ' ' || coalesce(sj.name, '') || ' (no class yet)' as name, coalesce(sj.colour,'#8494c2') as colour,
        'interest' as status, 5 as threshold, null as priority_until, 48 as priority_hours,
        ${ent.replace("%W", "w.group_id is null and w.level_id is not distinct from x.level_id and w.subject_id is not distinct from x.subject_id")} as entries
      from (select distinct level_id, subject_id from waitlist_entries where group_id is null and enrolled_at is null) x left join levels l on l.id = x.level_id left join subjects sj on sj.id = x.subject_id`);
    return [...groups, ...loose];
  });
}
