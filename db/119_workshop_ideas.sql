-- 27 Nov (Alfonso: "i would like teachers to submit workshop ideas. subject, overview and slides (optional initially)"):
-- teachers suggest workshops from 1:1s & workshops; the office sees them on Workshops and can turn one into a draft workshop.
create table if not exists workshop_ideas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade default current_school(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  subject text not null check (char_length(subject) between 2 and 80),
  overview text not null check (char_length(overview) between 20 and 3000),
  slides_url text check (slides_url is null or slides_url ~ '^https?://'),
  status text not null default 'new' check (status in ('new', 'liked', 'scheduled', 'not_now')),
  office_note text,
  workshop_id uuid references workshops(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workshop_ideas_school on workshop_ideas (school_id, created_at desc);
alter table workshop_ideas enable row level security;
drop policy if exists school_isolation on workshop_ideas;
create policy school_isolation on workshop_ideas to app_user using (school_id = current_school()) with check (school_id = current_school());
grant select, insert, update, delete on workshop_ideas to app_user;
