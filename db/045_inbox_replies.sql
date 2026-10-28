-- Replies sent from the admin's Inbox panel (through the Reply-from account's Gmail): who replied, when, and what was said.
alter table inbox_messages add column if not exists replied_at timestamptz;
alter table inbox_messages add column if not exists replied_by uuid references users(id) on delete set null;
alter table inbox_messages add column if not exists reply_from citext;
alter table inbox_messages add column if not exists reply_body text;
