-- More than one inbox can be read (e.g. ose@ and alfonso@): each message remembers which mailbox it came from,
-- and its Message-ID, so an email sent to both addresses shows once.
alter table inbox_messages add column if not exists mailbox citext;
alter table inbox_messages add column if not exists message_id text;
create index if not exists inbox_messages_msgid on inbox_messages (school_id, message_id);
