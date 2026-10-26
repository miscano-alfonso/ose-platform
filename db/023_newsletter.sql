-- Newsletter (Admin → Newsletter, Subscribers, Email stats), modelled on the Giles website's newsletter section:
-- footer sign-up with double opt-in, a block email builder, sending through Brevo, and opens/clicks.

create table if not exists newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  email       text not null check (char_length(email) between 3 and 200),
  name        text not null default '' check (char_length(name) <= 80),
  status      text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed')),
  source      text not null default '' check (char_length(source) <= 200),
  token       text not null default replace(gen_random_uuid()::text, '-', ''),
  ip_hash     text not null default '',
  created_at  timestamptz not null default now(),
  asked_at    timestamptz,
  confirmed_at timestamptz,
  left_at     timestamptz,
  unique (school_id, email)
);
create index if not exists newsletter_subscribers_token on newsletter_subscribers (token);

create table if not exists newsletter_emails (
  id          text primary key check (id ~ '^[a-z0-9]{6,20}$'),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null default '',
  subject     text not null default '',
  preheader   text not null default '',
  template    text not null default '',
  blocks      jsonb not null default '[]'::jsonb,
  brevo       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

-- opens and clicks from emails sent with the site's own tracking (copied or downloaded HTML); never an address
create table if not exists newsletter_events (
  id          bigserial primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  email_id    text not null,
  kind        char(1) not null check (kind in ('o', 'c')),
  reader      text not null,
  link        text not null default '',
  at          timestamptz not null default now()
);
create index if not exists newsletter_events_email on newsletter_events (school_id, email_id, at);

-- small settings: brevo (account, sender, list; the API key stays server-side), brevo_stats cache, test-send counts
create table if not exists newsletter_kv (
  school_id  uuid not null references schools(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9_:-]{1,80}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);

grant select, insert, update, delete on newsletter_subscribers, newsletter_emails, newsletter_events, newsletter_kv to app_user;
grant usage on sequence newsletter_events_id_seq to app_user;
alter table newsletter_subscribers enable row level security;
alter table newsletter_emails enable row level security;
alter table newsletter_events enable row level security;
alter table newsletter_kv enable row level security;
drop policy if exists school_isolation on newsletter_subscribers;
create policy school_isolation on newsletter_subscribers to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on newsletter_emails;
create policy school_isolation on newsletter_emails to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on newsletter_events;
create policy school_isolation on newsletter_events to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on newsletter_kv;
create policy school_isolation on newsletter_kv to app_user using (school_id = current_school()) with check (school_id = current_school());
