-- 11 Nov: termly payments taken by the site through Stripe: Bacs Direct Debit by default, card when the office allows it.
-- Built and tried with a Stripe TEST key first; the live site stays read-only on Stripe until the school leaves TechSaga.

-- how each family pays each term
create table if not exists family_pay_methods (
  parent_id         uuid primary key references parents(id) on delete cascade,
  school_id         uuid not null references schools(id) on delete cascade,
  method            text not null default 'bacs' check (method in ('bacs', 'card')),
  card_allowed      boolean not null default false,          -- the office lets this family pay by card instead
  stripe_customer   text,
  payment_method    text,                                    -- pm_… (the bank account or card Stripe holds)
  mandate           text,                                    -- mandate_… for Direct Debit
  status            text not null default 'none' check (status in ('none', 'pending', 'active', 'inactive')),
  label             text,                                    -- "Bank •••• 1234" / "Visa •••• 4242"
  livemode          boolean not null default false,
  set_up_at         timestamptz,
  updated_at        timestamptz not null default now()
);

-- one payment per family per due date (all their children's courses for that term together)
create table if not exists pay_collections (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  parent_id         uuid not null references parents(id) on delete cascade,
  due_on            date not null,
  attempt           smallint not null default 1,
  method            text not null check (method in ('bacs', 'card')),
  amount_pence      integer not null check (amount_pence > 0),
  instalment_ids    uuid[] not null,
  payment_intent    text unique,
  status            text not null default 'creating' check (status in ('creating', 'processing', 'succeeded', 'failed', 'cancelled')),
  error             text,
  livemode          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (parent_id, due_on, attempt)
);
create index if not exists pay_collections_school on pay_collections (school_id, created_at desc);

alter table instalments add column if not exists next_attempt_on date;   -- after a failed collection: when to try once more

grant select, insert, update, delete on family_pay_methods, pay_collections to app_user;
alter table family_pay_methods enable row level security;
alter table pay_collections enable row level security;
drop policy if exists school_isolation on family_pay_methods;
drop policy if exists school_isolation on pay_collections;
create policy school_isolation on family_pay_methods to app_user using (school_id = current_school()) with check (school_id = current_school());
create policy school_isolation on pay_collections to app_user using (school_id = current_school()) with check (school_id = current_school());
