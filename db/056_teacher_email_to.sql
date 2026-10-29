-- A teacher's email to the school can go to one person (e.g. the principal, or IT support) instead of the office.
alter table inbox_messages add column if not exists to_user uuid references users(id) on delete set null;
