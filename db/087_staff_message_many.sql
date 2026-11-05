-- 5 Nov: a teacher can message everyone on the school's list at once ("Everyone"). The people it went to are kept here;
-- to_user stays the first of them so older code still shows a name.
alter table inbox_messages add column if not exists to_users uuid[];
