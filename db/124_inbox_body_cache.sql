-- 27 Nov (Alfonso: "the email feature is very slow"): an email's text is kept after it's first opened, so opening it
-- again doesn't wait for Gmail.
alter table inbox_messages add column if not exists body_text text;
alter table inbox_messages add column if not exists body_to text;
