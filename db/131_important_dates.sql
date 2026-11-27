-- 27 Nov (Alfonso: "in resources, have a section on Information ... and Important dates, to list when to book exams, when
-- exams are. These should also be auto emailed to parents to remind them to book exams with Tutors & Exams using our
-- partner code"). Dates shown on the parent and student Resources page (Important dates), edited in Admin → Website →
-- Resources. `remind` dates (booking deadlines) get the "Exam booking reminder" automation. The exam partner's name, booking
-- link and partner code are kept in meet_kv 'exam_partner'.
create table if not exists important_dates (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  title      text not null check (length(title) between 1 and 160),
  when_text  text check (when_text is null or length(when_text) <= 60),   -- shown instead of the date, e.g. "May to June 2027"
  starts_on  date,                                                         -- for the order and reminders; empty = "Now"
  ends_on    date,
  details    text check (details is null or length(details) <= 600),
  link       text check (link is null or (link ~ '^https://' and length(link) <= 600)),
  kind       text not null default 'other' check (kind in ('book', 'exam', 'results', 'other')),
  remind     boolean not null default false,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists important_dates_school on important_dates (school_id, starts_on);
grant select, insert, update, delete on important_dates to app_user;
alter table important_dates enable row level security;
drop policy if exists school_isolation on important_dates;
create policy school_isolation on important_dates to app_user using (school_id = current_school()) with check (school_id = current_school());

-- OH-SO ED's summer 2027 dates: the ones on the website's Home Ed hub (Tutors & Exams, checked October 2026)
insert into important_dates (school_id, title, when_text, starts_on, ends_on, details, link, kind, remind)
  select s.id, d.title, d.when_text, d.starts_on::date, d.ends_on::date, d.details, d.link, d.kind, d.remind
  from schools s cross join (values
    ('Choose subjects and exam boards', 'Now', null, null, 'Choose subjects and exam boards with us. If your child may need access arrangements (such as extra time), start these first: they have their own, earlier deadlines.', 'https://www.tutorsandexams.uk/access-arrangements/', 'book', false),
    ('Tutors & Exams entry deadline for summer 2027', null, '2027-02-07', null, 'The entry deadline for summer 2027 (all UK and international qualifications). Late fees apply from 8 February.', 'https://www.tutorsandexams.uk/exam-centres/entry-deadline-dates/', 'book', true),
    ('Entries close for subjects with a language speaking test', null, '2027-03-29', null, 'Entries close for subjects with a modern foreign language speaking test.', 'https://www.tutorsandexams.uk/', 'book', true),
    ('All other entries close', null, '2027-04-04', null, 'All other entries close, or sooner if a centre is full.', 'https://www.tutorsandexams.uk/', 'book', true),
    ('Speaking tests for language subjects', '12 to 30 April 2027', '2027-04-12', '2027-04-30', 'The speaking test window for language subjects. The dates can''t be changed, so keep them free.', 'https://www.tutorsandexams.uk/', 'exam', false),
    ('Written exams', 'May to June 2027', '2027-05-01', '2027-06-30', 'Your timetable and joining instructions arrive through the Tutors & Exams Candidate Hub (TECH). Arrive 30 minutes early with photo ID.', 'https://www.tutorsandexams.uk/exam-centres/', 'exam', false),
    ('Results', 'August 2027', '2027-08-01', '2027-08-31', 'Results come through TECH, about two months after the last exam. Certificates are posted about 15 weeks later.', 'https://www.tutorsandexams.uk/faq/', 'results', false)
  ) as d(title, when_text, starts_on, ends_on, details, link, kind, remind)
  where s.slug = 'ohsoed' and not exists (select 1 from important_dates x where x.school_id = s.id);
