-- Jobs: vacancies on the website and teacher applications.
-- Applicants must upload PGCE evidence and name at least two referees (checked by the website and by the database).
create table if not exists job_posts (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9-]+$'),
  title        text not null check (char_length(title) between 1 and 160),
  subjects     text not null default '' check (char_length(subjects) <= 200),
  location     text not null default 'Remote (online)' check (char_length(location) <= 120),
  hours        text not null default '' check (char_length(hours) <= 120),
  pay          text not null default '' check (char_length(pay) <= 120),
  closes_on    date,
  summary      text not null default '' check (char_length(summary) <= 400),
  description  text not null default '' check (char_length(description) <= 12000),
  status       text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (school_id, slug)
);
create table if not exists job_applications (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  job_id          uuid not null references job_posts(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  email           text not null check (char_length(email) between 3 and 200),
  phone           text not null default '' check (char_length(phone) <= 40),
  location        text not null default '' check (char_length(location) <= 120),
  subjects        text not null default '' check (char_length(subjects) <= 300),
  pgce_subject    text not null default '' check (char_length(pgce_subject) <= 200),
  pgce_year       text not null default '' check (char_length(pgce_year) <= 10),
  pgce_file       bytea not null,
  pgce_file_name  text not null,
  pgce_file_type  text not null,
  cv_file         bytea,
  cv_file_name    text,
  cv_file_type    text,
  cover_letter    text not null check (char_length(cover_letter) between 1 and 8000),
  right_to_work   boolean not null,
  dbs             text not null check (dbs in ('update_service', 'current', 'willing')),
  referees        jsonb not null check (jsonb_typeof(referees) = 'array' and jsonb_array_length(referees) >= 2),
  status          text not null default 'new' check (status in ('new', 'shortlisted', 'interview', 'offered', 'appointed', 'rejected', 'withdrawn')),
  notes           text not null default '' check (char_length(notes) <= 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists job_applications_job on job_applications (job_id, created_at desc);
grant select, insert, update, delete on job_posts, job_applications to app_user;
alter table job_posts enable row level security;
alter table job_applications enable row level security;
drop policy if exists school_isolation on job_posts;
create policy school_isolation on job_posts to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on job_applications;
create policy school_isolation on job_applications to app_user using (school_id = current_school()) with check (school_id = current_school());
