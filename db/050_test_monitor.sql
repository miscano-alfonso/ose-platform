-- Test mode: held emails can be copied to a monitoring address (e.g. testing@, an alias of ose@) so the office sees
-- each one as it would have gone. copied = a copy went to that address.
alter table held_messages add column if not exists copied boolean not null default false;
