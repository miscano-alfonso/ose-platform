-- Who each inbox email was addressed to (To and Cc), so a teacher's dashboard can show the family emails sent to them.
alter table inbox_messages add column if not exists to_addrs text[];
create index if not exists inbox_messages_to on inbox_messages using gin (to_addrs);
