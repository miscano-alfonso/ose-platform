-- Notes and "needs a check" flags for records imported from TechSaga.
alter table parents add column if not exists admin_note text;
alter table enrolments add column if not exists needs_check boolean not null default false,
                       add column if not exists admin_note text,
                       add column if not exists source text;

-- Staff invitations: an admin invites an admin or a teacher; the invite link (shown once, sent by the admin)
-- lets them choose their own password. Only a hash of the link's token is stored.
create table staff_invites (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  email           citext not null,
  name            text not null,
  role            user_role not null check (role in ('school_admin', 'teacher')),
  teacher_id      uuid references teachers(id) on delete cascade,   -- inviting an existing teacher record
  token_hash      text not null unique,
  invited_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  revoked_at      timestamptz
);
alter table users add column if not exists last_sign_in_at timestamptz;
alter table users add column if not exists disabled_at timestamptz;

grant select, insert, update, delete on staff_invites to app_user;
alter table staff_invites enable row level security;
alter table staff_invites no force row level security;
create policy school_isolation on staff_invites to app_user using (school_id = current_school()) with check (school_id = current_school());
