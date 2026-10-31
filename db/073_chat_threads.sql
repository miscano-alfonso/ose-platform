-- Class chats as threads (31 Oct): a message either starts a thread (with a topic, e.g. "Homework question 3") or replies
-- in one (parent_id), so each conversation stays together. Older messages are threads of their own.
alter table student_chat_messages add column if not exists parent_id uuid references student_chat_messages(id) on delete cascade;
alter table student_chat_messages add column if not exists topic text check (topic is null or char_length(topic) between 1 and 120);
create index if not exists student_chat_messages_parent on student_chat_messages (parent_id, created_at) where parent_id is not null;

-- a reply must be in the same chat as its thread, and threads don't nest; replies have no topic
create or replace function student_chat_thread_guard() returns trigger language plpgsql as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;
  select chat_id, parent_id into p from student_chat_messages where id = new.parent_id;
  if p.chat_id is distinct from new.chat_id then raise exception 'reply is not in this chat'; end if;
  if p.parent_id is not null then new.parent_id := p.parent_id; end if;   -- a reply to a reply joins the same thread
  new.topic := null;
  return new;
end $$;
drop trigger if exists student_chat_thread_guard on student_chat_messages;
create trigger student_chat_thread_guard before insert on student_chat_messages for each row execute function student_chat_thread_guard();

-- Demo Academy: each class chat gets a few threads with replies (run after demo_comms on every rebuild, src/lib/demo.ts)
create or replace function demo_threads() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; c record; st uuid[]; t1 uuid; t2 uuid; base timestamptz;
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  for c in select ch.id, g.teacher_id from student_chats ch join course_groups g on g.id = ch.group_id where ch.school_id = demo and ch.kind = 'class' and g.teacher_id is not null loop
    select array_agg(e.student_id order by s.first_name) into st from enrolments e join students s on s.id = e.student_id
      where e.group_id = (select group_id from student_chats where id = c.id) and e.status = 'active' and not e.is_taster and s.chat_access <> 'none';
    continue when coalesce(array_length(st, 1), 0) < 2;
    begin
      delete from student_chat_messages where chat_id = c.id;
      base := date_trunc('hour', now()) - interval '2 days';
      insert into student_chat_messages (school_id, chat_id, sender_student_id, topic, body, created_at)
        values (demo, c.id, st[1], 'Homework question 3', 'Can someone explain question 3? I don’t get where the second step comes from.', base) returning id into t1;
      insert into student_chat_messages (school_id, chat_id, sender_student_id, parent_id, body, created_at)
        values (demo, c.id, st[2], t1, 'I think you use the method from Tuesday’s lesson', base + interval '25 minutes');
      insert into student_chat_messages (school_id, chat_id, sender_teacher_id, parent_id, body, created_at)
        values (demo, c.id, c.teacher_id, t1, 'Good start. Look again at the worked example on slide 6, then have another go.', base + interval '2 hours');
      insert into student_chat_messages (school_id, chat_id, sender_student_id, parent_id, body, created_at)
        values (demo, c.id, st[1], t1, 'Thanks, that makes sense now!', base + interval '3 hours');
      insert into student_chat_messages (school_id, chat_id, sender_student_id, topic, body, created_at)
        values (demo, c.id, st[2], 'Quiz on Thursday', 'Is the quiz on Thursday?', base + interval '1 day') returning id into t2;
      insert into student_chat_messages (school_id, chat_id, sender_teacher_id, parent_id, body, created_at)
        values (demo, c.id, c.teacher_id, t2, 'Yes, Thursday after the starter. It covers everything since half term.', base + interval '1 day 1 hour');
      insert into student_chat_messages (school_id, chat_id, sender_student_id, parent_id, body, created_at)
        values (demo, c.id, st[least(3, array_length(st, 1))], t2, 'Good luck everyone', base + interval '1 day 90 minutes');
      insert into student_chat_messages (school_id, chat_id, sender_teacher_id, topic, body, created_at)
        values (demo, c.id, c.teacher_id, 'Worked answers', 'Great questions this week. The worked answers are in Classroom now.', base + interval '1 day 5 hours');
    exception when others then null;   -- the chat rules said no: leave this class as it was
    end;
  end loop;
end $$;
revoke all on function demo_threads() from public;
grant execute on function demo_threads() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_threads(); end if; end $$;
