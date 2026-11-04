-- 4 Nov: Sketch Studio runs each draft, check or change as a background job, and the page checks back every few seconds.
-- The website's host cuts long requests off (504), so nothing waits on one request for the whole drawing.
create table if not exists studio_jobs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  created_by  uuid references users(id) on delete set null,
  status      text not null default 'running' check (status in ('running', 'done', 'error')),
  text        text not null default '',          -- Claude's answer so far, then in full
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_jobs_school on studio_jobs (school_id, created_at desc);
grant select, insert, update, delete on studio_jobs to app_user;
alter table studio_jobs enable row level security;
drop policy if exists school_isolation on studio_jobs;
create policy school_isolation on studio_jobs to app_user using (school_id = current_school()) with check (school_id = current_school());
