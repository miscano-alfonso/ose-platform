-- Website editor: editable homepage text and ticker, and the FAQs (copied from the current site).
create table if not exists site_content (
  school_id uuid not null references schools(id) on delete cascade,
  key       text not null check (key ~ '^[a-z_]+$'),
  value     text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null,
  primary key (school_id, key)
);
create table if not exists faqs (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 300),
  answer     text not null check (char_length(answer) between 1 and 5000),
  sort_order integer not null default 0,
  published  boolean not null default true
);
grant select, insert, update, delete on site_content, faqs to app_user;
alter table site_content enable row level security;
alter table faqs enable row level security;
drop policy if exists school_isolation on site_content;
create policy school_isolation on site_content to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on faqs;
create policy school_isolation on faqs to app_user using (school_id = current_school()) with check (school_id = current_school());

do $$ declare sch uuid; begin
  select id into sch from schools where slug = 'ohsoed'; if sch is null then return; end if;
  if exists (select 1 from faqs where school_id = sch) then return; end if;
  insert into faqs (school_id, question, answer, sort_order) values
    (sch, 'What courses do you teach?', 'We offer courses at KS3 (11 - 13), pre-GCSE (13-14) and i/GCSE level (14-16).', 10),
    (sch, 'What subjects do you teach?', '- English Language
- English Literature
- Science (Double Award)
- Chemistry (Single Award)
- Biology (Single Award)
- Physics (Single Award)
- Maths (Foundation / Higher)
- History
- Geography
- Business Studies', 20),
    (sch, 'Can my child join mid-term?', 'Yes, at KS3 and Pre-GCSE level. On occasion, we may accept GCSE students in the September term, provided students are happy to catch up on what has been missed. Recordings and resources from previous lessons will be available for your child to view at any time throughout the course.
Payment will be required for the full term your child joins.', 30),
    (sch, 'Can we cancel?', 'Yes. At KS3 and Pre-GCSE level, one full term''s notice is required to de-register from a course. We would ask that parents cancel via the parent dashboard for us to approve.
We appreciate that there might be reason for students to cancel GCSE courses, however, places cannot be offered to another student once booking has been closed. Therefore, we require two full term’s notice of your intention to de-register. Again, we would ask that parents request a cancellation via the parent dashboard for us to approve. We will stop payments once your request has been approved.', 40),
    (sch, 'How long are live lessons?', '45 mins.', 50),
    (sch, 'How are lessons taught?', 'Lessons are taught via our online platform. Students will have the opportunity to practise skills after the lesson within home-based study tasks, which can be submitted to teachers for feedback.', 60),
    (sch, 'What if I miss a lesson?', 'We record live lessons and upload these on the student platform after the lesson has taken place.
It is forbidden for parents or students to record, livestream, screenshot or photograph during the lesson.', 70),
    (sch, 'How many students are there in a class?', 'Our classes run between 5–12 students. Keeping numbers low aids greater interaction and participation. When a course becomes full, it will disappear from our course booking page. We aim to put on new classes once a course reaches capacity.', 80),
    (sch, 'What are your teacher qualifications?', 'All OH-SO ED teachers have:
- A Post Graduate Certification in their secondary subject specialism
- 6 or more years experience of teaching in UK schools and online
Some teachers are:
- Edexcel Examiners', 90),
    (sch, 'Do you have an up-to-date DBS certificate?', 'Yes, we are required by law to have an up-to-date DBS certificate if working with young people.', 100),
    (sch, 'Do you assess work?', 'Yes. Every course comes with weekly home-study tasks, which are given detailed feedback, including targets for improvement. At GCSE level these will be required tasks, however, it is the responsibility of the parent and student to ensure that work is completed. OH-SO ED teachers will not chase home study tasks if not submitted, but will contact parents in this instance.
We also provide opportunities to complete mock exams within GCSE courses.', 110),
    (sch, 'Can we have a trial lesson?', 'Yes. All group lessons can be trialled in a free taster. Please use our booking link on the website if you would like your child to take part in a taster lesson.', 120),
    (sch, 'Do you book exams?', 'Unfortunately, as tutors we cannot book exams. We are a partner with Tutors and Exams, who will guide you through this process. They have exam centres all over the UK and will discuss any access requirements with you. OH-SO ED parents will receive a discount upon booking with them.', 130),
    (sch, 'Do you cater for SEND?', 'All of our teachers are fully qualified and experienced in teaching children with SEND. We believe in keeping class sizes small, allowing for inclusive and personalised support. We also aim to provide a pressure-free environment where children feel encouraged to take part at their own pace.
We ask parents to inform us of any SEND when enrolling.', 140),
    (sch, 'Do you teach on Bank Holidays?', 'Many parents ask us this question, so we thought we would include this information here. Apart from Easter Monday and unless otherwise stated, we teach on bank holidays. There may be odd occasions when we need to cancel a lesson on a bank holiday. In the event of a cancellation, parents will be informed and the lesson rescheduled.', 150);
end $$;
