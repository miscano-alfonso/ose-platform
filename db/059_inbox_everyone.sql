-- The school inbox can also show emails from people the school doesn't know yet (kind 'other').
alter table inbox_messages drop constraint if exists inbox_messages_kind_check;
alter table inbox_messages add constraint inbox_messages_kind_check check (kind in ('family', 'enquiry', 'waiting', 'taster', 'staff', 'other'));
-- forget which emails were skipped before (they were from unknown senders), and look back 30 days on the next check,
-- so emails from people the school doesn't know yet (e.g. a test sent today) come in now
delete from meet_kv where key = 'inbox_seen';
update meet_kv set value = value - 'last' where key = 'inbox';
