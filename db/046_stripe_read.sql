-- Read-only Stripe: card payments mirrored from OH-SO ED's Stripe account (read with a restricted, read-only key,
-- and kept up to date by Stripe's notifications), then matched to families' term instalments.
create table if not exists stripe_charges (
  id              text primary key,                 -- ch_…
  school_id       uuid not null references schools(id) on delete cascade,
  payment_intent  text,
  created_at      timestamptz not null,
  amount_pence    integer not null,
  refunded_pence  integer not null default 0,
  currency        text not null default 'gbp',
  status          text not null,                    -- succeeded / failed / pending
  email           citext,
  customer        text,
  description     text,
  parent_id       uuid references parents(id) on delete set null,
  instalment_ids  uuid[] not null default '{}',
  matched_at      timestamptz,
  matched_by      text,                             -- 'auto' or the admin's name
  ignored         boolean not null default false,
  synced_at       timestamptz not null default now()
);
create index if not exists stripe_charges_open on stripe_charges (school_id, created_at) where matched_at is null and not ignored;
grant select, insert, update, delete on stripe_charges to app_user;
alter table stripe_charges enable row level security;
drop policy if exists school_isolation on stripe_charges;
create policy school_isolation on stripe_charges to app_user using (school_id = current_school()) with check (school_id = current_school());
