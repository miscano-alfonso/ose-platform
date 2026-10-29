-- Demo Academy: more made-up conversations so every dashboard has something to show: parent–teacher Messages,
-- class chats (and a couple of private chats between students), family emails in the school inbox (some answered),
-- and teachers' emails to the school. Everything is invented; addresses are @example.com / @pupils.example.
-- demo_comms() clears what it made before (so it can run again) and is called after demo_activity() on each reset.
create or replace function demo_comms() returns void language plpgsql security definer set search_path = public as $$
declare demo uuid; e record; th uuid; ch uuid; n int := 0; t record; admin_u uuid; office text := 'office@example.com';
  pmsg text[][] := array[
    ['Times tables practice','Hi, is there a good way to practise times tables at home? We’ve been trying flashcards.','Flashcards are great. Little and often works best: five minutes a day, and mix in a few divisions too.','Thank you, we’ll keep going!'],
    ['Essay feedback','Thank you for the detailed feedback on the essay. Should she redraft the introduction?','Yes please, just the first paragraph. Aim for a clear argument in the opening sentence.',''],
    ['Exam board question','Which exam board will the iGCSE be with? We want to buy a revision guide.','It’s Edexcel International. The CGP guide for that specification is a good choice.','Perfect, ordered it today.'],
    ['Joining late on Monday','He has a hospital appointment on Monday and will join about 20 minutes late. Sorry!','No problem at all, thanks for telling me. I’ll make sure he’s caught up.',''],
    ['Science practical','She loved the experiment today! Can she try it again at home?','Lovely to hear. Yes, with an adult: the instructions are in Classroom under Lesson 6.','Thanks so much.'],
    ['Feeling a bit stuck','He says he feels a bit lost with algebra this week.','','']];
  chatlines text[] := array['Has anyone started the homework yet?','I did question 1, it was ok','Is the quiz on Thursday?','Yes, Thursday after the starter','Can someone explain question 3?','Thanks, that makes sense now!','See you all on Monday','Good luck with the test everyone'];
  emails text[][] := array[
    ['Invoice question','Hello, I think we were charged twice for Term 2. Could you check please?','Thanks for flagging this. You were charged once; the second line is the registration fee for your younger child. I’ve attached a breakdown.'],
    ['Change of email address','Please could you use my new email address for future invoices and reminders?',''],
    ['Thank you!','Just wanted to say how much our daughter is enjoying her classes this term. Thank you all.','That’s so kind of you, we’ve passed this on to her teachers.'],
    ['Holiday dates','Could you confirm the dates for the February half term please?',''],
    ['Booking a second course','We’d like to add iGCSE Biology for next term. Is there still space?','']];
begin
  select id into demo from schools where slug = 'demo-academy' and is_demo; if demo is null then return; end if;
  perform setseed(0.29);
  delete from message_threads where school_id = demo and subject = any(array['Times tables practice','Essay feedback','Exam board question','Joining late on Monday','Science practical','Feeling a bit stuck']);
  delete from inbox_messages where school_id = demo and gmail_id like 'local:demo-%';
  delete from student_chat_messages where school_id = demo;
  delete from student_chats where school_id = demo and kind = 'direct';
  update students set chat_access = case when random() < 0.5 then 'class_and_private' else 'class' end where school_id = demo;

  -- parent–teacher Messages (recent, some waiting for the teacher's reply)
  for e in select x.student_id, s.parent_id, g.teacher_id, row_number() over (order by x.id desc) as k from enrolments x join students s on s.id = x.student_id
      join course_groups g on g.id = x.group_id where x.school_id = demo and x.status = 'active' and not x.is_taster and g.teacher_id is not null order by x.id desc limit 6 loop
    insert into message_threads (school_id, parent_id, teacher_id, student_id, subject, status, created_at, last_message_at, started_by)
      values (demo, e.parent_id, e.teacher_id, e.student_id, pmsg[e.k][1], 'open', now() - (e.k * 9 || ' hours')::interval, now() - (e.k * 9 - 3 || ' hours')::interval, 'parent')
      returning id into th;
    insert into messages (school_id, thread_id, sender, body, created_at) values (demo, th, 'parent', pmsg[e.k][2], now() - (e.k * 9 || ' hours')::interval);
    if pmsg[e.k][3] <> '' then insert into messages (school_id, thread_id, sender, body, created_at) values (demo, th, 'teacher', pmsg[e.k][3], now() - (e.k * 9 - 2 || ' hours')::interval); end if;
    if pmsg[e.k][4] <> '' then insert into messages (school_id, thread_id, sender, body, created_at) values (demo, th, 'parent', pmsg[e.k][4], now() - (e.k * 9 - 3 || ' hours')::interval); end if;
  end loop;

  -- class chats: a few lines from students and the teacher in each class
  for t in select g.id as gid, g.teacher_id from course_groups g where g.school_id = demo and exists (select 1 from enrolments x where x.group_id = g.id and x.status = 'active') loop
    select id into ch from student_chats where group_id = t.gid and kind = 'class';
    if ch is null then insert into student_chats (school_id, kind, group_id) values (demo, 'class', t.gid) returning id into ch; end if;
    n := 0;
    for e in select x.student_id from enrolments x where x.group_id = t.gid and x.status = 'active' and not x.is_taster order by random() limit 4 loop
      n := n + 1;
      insert into student_chat_messages (school_id, chat_id, sender_student_id, body, created_at) values (demo, ch, e.student_id, chatlines[1 + ((n * 2 + length(t.gid::text)) % 8)], now() - ((5 - n) * 37 || ' minutes')::interval - interval '1 day');
    end loop;
    if t.teacher_id is not null then
      insert into student_chat_messages (school_id, chat_id, sender_teacher_id, body, created_at) values (demo, ch, t.teacher_id, 'Great questions everyone. The worked answers are in Classroom now.', now() - interval '20 hours');
    end if;
  end loop;
  -- two private chats between classmates who both have private chat on
  for e in select a.student_id as a, b.student_id as b from enrolments a join enrolments b on b.group_id = a.group_id and b.student_id > a.student_id
      join students sa on sa.id = a.student_id join students sb on sb.id = b.student_id
      where a.school_id = demo and a.status = 'active' and b.status = 'active' and sa.chat_access = 'class_and_private' and sb.chat_access = 'class_and_private' limit 2 loop
    begin
      insert into student_chats (school_id, kind) values (demo, 'direct') returning id into ch;
      insert into student_chat_members (school_id, chat_id, student_id) values (demo, ch, e.a), (demo, ch, e.b);
      insert into student_chat_messages (school_id, chat_id, sender_student_id, body, created_at) values
        (demo, ch, e.a, 'Did you understand the last question in the homework?', now() - interval '3 hours'),
        (demo, ch, e.b, 'Sort of! You have to work out the bracket first.', now() - interval '2 hours 40 minutes'),
        (demo, ch, e.a, 'Ahh ok thanks!', now() - interval '2 hours 30 minutes');
    exception when others then null;   -- the chat rules said no: skip it
    end;
  end loop;

  -- family emails in the school inbox (shown in the site, not read from Gmail)
  select id into admin_u from users where school_id = demo and role = 'school_admin' order by created_at limit 1;
  n := 0;
  for e in select p.id, p.first_name, p.last_name, p.email::text as email from parents p where p.school_id = demo order by p.created_at desc limit 5 loop
    n := n + 1;
    insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, body, received_at, parent_id, kind, mailbox, read_at, replied_at, reply_from, reply_body)
      values (demo, 'local:demo-f' || n, 'local:demo-f' || n, e.first_name || ' ' || e.last_name, e.email, emails[n][1], left(emails[n][2], 400), e.first_name || E',\n\n' || emails[n][2] || E'\n\nBest wishes,\n' || e.first_name,
        now() - (n * 7 || ' hours')::interval, e.id, 'family', office,
        case when emails[n][3] <> '' or n > 3 then now() - (n * 7 - 1 || ' hours')::interval end,
        case when emails[n][3] <> '' then now() - (n * 7 - 2 || ' hours')::interval end, case when emails[n][3] <> '' then office end, nullif(emails[n][3], ''));
  end loop;
  insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, body, received_at, kind, mailbox)
    values (demo, 'local:demo-q1', 'local:demo-q1', 'Arjun Patel', 'arjun.p@example.com', 'Edexcel iGCSE Biology', 'Do you cover the Edexcel iGCSE Biology specification?',
      E'Hello,\n\nDo you cover the Edexcel iGCSE Biology specification, and is there space in January?\n\nThanks,\nArjun', now() - interval '1 day', 'enquiry', office);
  -- teachers' emails to the school (to the office, and one to the admin by name)
  n := 0;
  for e in select u.id, u.name, u.email::text as email from users u join teachers tc on tc.user_id = u.id where u.school_id = demo and u.role = 'teacher' order by u.name limit 3 loop
    n := n + 1;
    insert into inbox_messages (school_id, gmail_id, thread_id, from_name, from_email, subject, snippet, body, received_at, kind, mailbox, sent_by, to_user, read_at, replied_at, reply_from, reply_body)
      values (demo, 'local:demo-t' || n, 'local:demo-t' || n, e.name, e.email,
        (array['Cover for Thursday','Meet link not working','Printing for the mock exam'])[n],
        (array['I have a dentist appointment on Thursday afternoon. Could someone cover my 14:00 class?','The Meet link for my Wednesday class keeps saying the meeting has ended.','Could the office print 12 copies of the mock paper for Friday?'])[n],
        split_part(e.name, ' ', 1) || E' here.\n\n' || (array['I have a dentist appointment on Thursday afternoon. Could someone cover my 14:00 class? The lesson plan is in Classroom.','The Meet link for my Wednesday class keeps saying the meeting has ended. Could you check it?','Could the office print 12 copies of the mock paper for Friday? It’s in the shared Drive folder.'])[n] || E'\n\nThanks!',
        now() - (n * 5 || ' hours')::interval, 'staff', office, e.id, case when n = 2 then admin_u end,
        case when n <> 3 then now() - (n * 5 - 1 || ' hours')::interval end,
        case when n = 1 then now() - interval '4 hours' end, case when n = 1 then office end, case when n = 1 then 'Yes, Owen can cover it. Thanks for the notice, and good luck at the dentist!' end);
  end loop;
end $$;
revoke all on function demo_comms() from public;
grant execute on function demo_comms() to app_user;
do $$ begin if exists (select 1 from schools where slug = 'demo-academy' and is_demo) then perform demo_comms(); end if; end $$;
