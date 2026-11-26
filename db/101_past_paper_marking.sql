-- 26 Nov 2026: past paper marking as an order the teacher works on. A paper sent from the website (an enquiry of kind
-- 'marking') becomes paid when its Stripe payment is spotted (same email, the marking price, after it was sent) or the
-- office presses Paid. Paying gives it to the subject's teacher with a "back by" time (48 hours); the teacher can warn of
-- a delay (new time + reason, the parent is told) and sends the marked paper back from their dashboard.
create table if not exists marking_jobs (
  enquiry_id        uuid primary key references enquiries(id) on delete cascade,
  school_id         uuid not null references schools(id) on delete cascade,
  teacher_id        uuid references teachers(id) on delete set null,
  paid_at           timestamptz,
  paid_how          text check (paid_how in ('stripe', 'office')),
  stripe_charge_id  text unique,
  due_at            timestamptz,                 -- paid_at + the turnaround
  teacher_emailed_at timestamptz,
  delay_until       timestamptz,
  delay_reason      text,
  delayed_at        timestamptz,
  returned_at       timestamptz,
  returned_file     bytea,
  returned_name     text,
  returned_type     text,
  return_note       text,
  updated_at        timestamptz not null default now()
);
create index if not exists marking_jobs_teacher on marking_jobs (school_id, teacher_id) where returned_at is null;
grant select, insert, update, delete on marking_jobs to app_user;
alter table marking_jobs enable row level security;
drop policy if exists school_isolation on marking_jobs;
create policy school_isolation on marking_jobs to app_user using (school_id = current_school()) with check (school_id = current_school());

-- which teacher marks each subject (subjects themselves stay in site text marking_subjects)
create table if not exists marking_subject_teachers (
  school_id   uuid not null references schools(id) on delete cascade,
  subject     text not null,
  teacher_id  uuid not null references teachers(id) on delete cascade,
  primary key (school_id, subject)
);
grant select, insert, update, delete on marking_subject_teachers to app_user;
alter table marking_subject_teachers enable row level security;
drop policy if exists school_isolation on marking_subject_teachers;
create policy school_isolation on marking_subject_teachers to app_user using (school_id = current_school()) with check (school_id = current_school());

-- every paper already sent gets a job (unpaid), so the office can mark the ones already paid
insert into marking_jobs (enquiry_id, school_id)
  select e.id, e.school_id from enquiries e where e.kind = 'marking' on conflict do nothing;
