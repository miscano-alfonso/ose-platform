-- Teachers email the school: from their Email page (stored here, shown in Admin → Email → Inbox, no Gmail copy)
-- or from their own email to the school's address (read from Gmail like families' emails). kind 'staff'.
alter table inbox_messages drop constraint if exists inbox_messages_kind_check;
alter table inbox_messages add constraint inbox_messages_kind_check check (kind in ('family', 'enquiry', 'waiting', 'taster', 'staff'));
alter table inbox_messages add column if not exists body text;              -- the full text of an email written in the site
alter table inbox_messages add column if not exists sent_by uuid references users(id) on delete set null;  -- the teacher who wrote it in the site
