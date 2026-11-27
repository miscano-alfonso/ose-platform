-- 27 Nov (Alfonso: "add suggested dates ... warn the teacher if any dates clash with lessons ... aimed to those kids"):
-- who the idea is for (a level, or any), how long, and up to 3 suggested dates and times (London time).
alter table workshop_ideas add column if not exists level_id uuid references levels(id) on delete set null;
alter table workshop_ideas add column if not exists minutes smallint not null default 60 check (minutes between 15 and 240);
alter table workshop_ideas add column if not exists dates jsonb not null default '[]';
