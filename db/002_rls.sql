-- Row-level security: inside each request the app runs  SET LOCAL ROLE app_user  and
-- select set_config('app.school_id', '<uuid>', true);
-- Every query then only sees and writes that school's rows, even if app code forgets a filter.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;   -- no password: the app switches to it with SET ROLE inside each request
  end if;
end $$;
grant app_user to current_user;     -- lets the connecting owner SET ROLE app_user (needed on hosted Postgres such as Neon)

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage on all sequences in schema public to app_user;
revoke update, delete on ledger_entries from app_user;      -- the money ledger is append-only

create or replace function current_school() returns uuid
language sql stable as $$ select nullif(current_setting('app.school_id', true), '')::uuid $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = 'public' and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'school_id'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I no force row level security', t);   -- the owner (migrations) is exempt; the app always runs as app_user
    execute format('drop policy if exists school_isolation on %I', t);
    execute format('create policy school_isolation on %I to app_user using (school_id = current_school()) with check (school_id = current_school())', t);
  end loop;
end $$;

-- schools: a school can read only itself
alter table schools enable row level security;
alter table schools no force row level security;
drop policy if exists school_self on schools;
create policy school_self on schools to app_user using (id = current_school());

-- teacher_subjects has no school_id; scope it through the teacher
alter table teacher_subjects enable row level security;
alter table teacher_subjects no force row level security;
drop policy if exists via_teacher on teacher_subjects;
create policy via_teacher on teacher_subjects to app_user
  using (exists (select 1 from teachers t where t.id = teacher_id and t.school_id = current_school()))
  with check (exists (select 1 from teachers t where t.id = teacher_id and t.school_id = current_school()));
