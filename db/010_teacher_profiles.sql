-- Teacher profile pages (as on ohsoed.co.uk/teachers-details/...): a web address, qualifications, and an uploadable photo.
alter table teachers add column if not exists slug text, add column if not exists qualifications text[] not null default '{}',
  add column if not exists photo bytea, add column if not exists photo_type text, add column if not exists photo_updated_at timestamptz,
  add column if not exists sort_order smallint not null default 0;
create unique index if not exists teachers_slug on teachers (school_id, slug) where slug is not null;

-- The four profiles from the current website
do $$ declare sch uuid; begin
  select id into sch from schools where slug = 'ohsoed'; if sch is null then return; end if;
  update teachers t set slug = 'leanne-iacurci', designation = 'Principal & English Teacher', bio = 'Hi, I’m Leanne, a fully qualified secondary English teacher. I teach KS3, pre-GCSE and iGCSE courses in English Language and Literature for OH-SO ED.

I have over 15 years experience of teaching English in schools and online and am an Edexcel examiner, specialising in GCSE. I offer 1:1 lessons outside of group provision in GCSE and A Level.

In my time as a secondary specialist, I have held positions such as Lead English Teacher and Second in Department. With a passion for my subject and a genuine interest in the way young people learn, I have built excellent relationships with my students. I am an Ofsted rated ‘Outstanding’ English teacher, with extensive experience of guiding students through the necessary skills required to progress in English Language and Literature. I have proven success in providing students with outstanding results at GCSE.

All English courses at OH-SO ED will lead you through a personalised learning approach, catering for specific needs and providing those all important English skills to pass exams.

As an experienced Edexcel Examiner, I also have access to up to the minute assessment materials and grade criteria.

I provide weekly detailed feedback to students, providing fast and in the moment feedback.', qualifications = array['BA Hons English Language & Literature','PGC Journalism','PGCE Secondary English Language and Literature'], photo_asset = '/teachers/leanne-iacurci.webp'
    from users u where u.id = t.user_id and t.school_id = sch and split_part(u.name, ' ', 1) = 'Leanne';
  update teachers t set slug = 'jade-hicks', designation = 'Business & History Teacher', bio = 'Hi, I’m Jade, a fully qualified secondary Business and History specialist. I teach KS3, pre-GCSE and iGCSE courses in Business and History.

I have been a Business teacher for over 11 years, and I was Head of Business and Economics for 7 years. During this time my department was rated Ofsted outstanding. Throughout my secondary education career I taught students from Year 7 through to Year 13. I began my career as a History teacher, but then quickly developed a love of Business, and changed my specialism from there! The main bulk of my teaching career was guiding students through their GCSE and A-Level Business exams, achieving yearly excellent results.

I am incredibly passionate about my subject – Business is the most valuable and current subject that a student can study! Although I loved my mainstream teaching career, I was ready to branch into something new. My favourite part of the job is building relationships with students, and I enjoy how small group online teaching allows me to really get to know my students.

A key focus of my teaching style is mastery. My Business courses and lessons are designed to ensure retention of knowledge by; revisiting content regularly, applied learning, and using topical real-life examples to exemplify what we are learning. I also place a huge focus on exam skills, with weekly skills sessions at GCSE. As an Edexcel Business Examiner, I have access to up-to-date assessment guidance and material as well as extensive knowledge of the exam techniques students will need to use. I provide weekly detailed feedback to my students, and use live marking as a teaching tool in my skills sessions.', qualifications = array['BA Hons English','NPQLT in Business and Economics teaching','PGCE Secondary Education'], photo_asset = '/teachers/jade-hicks.webp'
    from users u where u.id = t.user_id and t.school_id = sch and split_part(u.name, ' ', 1) = 'Jade';
  update teachers t set slug = 'becky-randle', designation = 'Mathematics & Geography Teacher', bio = 'Hi I’m Becky, Maths teacher at OH-SO ED. I teach KS3, pre-GCSE and iGCSE courses in Maths.

I''ve been teaching maths for 7 years now, 5 of them online. Over the last 7 years, I''ve taught years 7 - 11 and have taught students with many additional learning needs. I have qualifications in SEN and mental health and I''m a mental health first aider. Mental health and well being is very important to me and I completely understand the challenges that young people face in today''s world. Online education has challenges just like in mainstream schools, but I believe in an educational approach where one size doesn''t fit all and online learning is much more adaptive.

I''ve been a private tutor for 10 years in both Maths and Geography. I''m also an examiner for Pearson and I''ve been a course writer for Oxbridge. I really enjoy small group teaching and my approach is relaxed, calm and encouraging.', qualifications = array['BA Hons Geography','PG Dip Ed with QTS in Secondary Mathematics','Mental Health First Aider','SEN Diploma','Understanding Mental Health in Young People Level 2','Educational Psychology Level 3','Online Teaching Level 4'], photo_asset = '/teachers/becky-randle.webp'
    from users u where u.id = t.user_id and t.school_id = sch and split_part(u.name, ' ', 1) = 'Becky';
  update teachers t set slug = 'rachel-rowe', designation = 'Science Teacher', bio = 'Hi, I’m Rachel, a fully qualified science teacher. I teach KS3, pre-GCSE and IGCSE classes. I have always loved learning about science as it helps us to understand how the world works! There are so many fascinating everyday life applications of science including medicines, nanotechnology, environment, genetics and technology. My favourite aspect of science is carrying out experiments which allow us to test out ideas. Experiments can be done anywhere (not just in a science lab). They can be lots of fun to do at home (although they can sometimes get quite messy)!

I have been a science teacher for 20 years. I taught in a school for 10 years and during this time held the roles of KS3 coordinator and 2nd in department. I then began private tutoring both face-to-face and online. I’m also an experienced examiner for OCR marking higher level GCSE Chemistry papers.

My teaching style is interactive with lots of real-life examples, experiments and demonstrations to help students understand key science concepts. At GCSE level there is a focus on exam technique and the important skills needed to provide precise answers in exams.', qualifications = array['BSc Biochemistry','PGCE Science'], photo_asset = '/teachers/rachel-rowe.webp'
    from users u where u.id = t.user_id and t.school_id = sch and split_part(u.name, ' ', 1) = 'Rachel';
  update teachers t set slug = trim(both '-' from lower(regexp_replace(u.name, '[^A-Za-z0-9]+', '-', 'g'))) from users u where u.id = t.user_id and t.slug is null;
end $$;
