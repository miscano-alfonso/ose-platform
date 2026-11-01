-- 1 Nov: a school switch for teachers messaging families and posting in class chats (meet_kv teacher_family_msgs).
-- Missing = on. OH-SO ED starts with it off while teachers use the live dashboard: they can still message the school.
insert into meet_kv (school_id, key, value) select id, 'teacher_family_msgs', 'false'::jsonb from schools where slug = 'ohsoed'
  on conflict (school_id, key) do nothing;
