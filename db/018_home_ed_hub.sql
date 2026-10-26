-- 'New to Home Ed?' resource hub: sections and links the office can edit in Admin → Home Ed hub.
create table if not exists hub_sections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 1 and 120),
  intro text not null default '' check (char_length(intro) <= 2000),
  sort_order integer not null default 0,
  published boolean not null default true,
  unique (school_id, slug)
);
create table if not exists hub_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  section_id uuid not null references hub_sections(id) on delete cascade,
  grp text not null default '' check (char_length(grp) <= 80),
  kind text not null default 'link' check (kind in ('link', 'video', 'date')),
  title text not null check (char_length(title) between 1 and 200),
  url text not null default '' check (url = '' or url ~ '^https://'),
  description text not null default '' check (char_length(description) <= 1000),
  sort_order integer not null default 0,
  published boolean not null default true
);
create index if not exists hub_links_section on hub_links (section_id, sort_order);
grant select, insert, update, delete on hub_sections, hub_links to app_user;
alter table hub_sections enable row level security;
alter table hub_links enable row level security;
drop policy if exists school_isolation on hub_sections;
create policy school_isolation on hub_sections to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on hub_links;
create policy school_isolation on hub_links to app_user using (school_id = current_school()) with check (school_id = current_school());

do $$ declare sch uuid; sec uuid; begin
  select id into sch from schools where slug = 'ohsoed'; if sch is null then return; end if;
  if exists (select 1 from hub_sections where school_id = sch) then return; end if;
  insert into hub_sections (school_id, slug, title, intro, sort_order) values (sch, 'leaving-school', 'Taking your child out of school', 'How deregistration works depends on where you live. In England and Wales you tell the school in writing; in Scotland you need the council''s consent to withdraw a child from a state school; in Northern Ireland you write to the principal. If your child attends a special school, or there is a school attendance order, you need the council''s agreement first. The Children''s Wellbeing and Schools Act 2026 will add council registers of children not in school and, for some children, council consent before they leave a school roll. Those parts were not yet in force when we last checked (October 2026), so check with your council before you act. This is general information, not legal advice.', 10) returning id into sec;
  insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order) values
    (sch, sec, 'England', 'link', 'Home education: the official GOV.UK guide', 'https://www.gov.uk/home-education', 'Tell the school in writing. The school must accept if you''re taking your child out completely. Special schools and school attendance orders need council permission.', 10),
    (sch, sec, 'England', 'link', 'Elective home education: guidance for parents (DfE)', 'https://assets.publishing.service.gov.uk/media/5ca21e22e5274a77d9d26feb/EHE_guidance_for_parentsafterconsultationv2.2.pdf', 'The Department for Education''s guidance on your rights and your council''s role (PDF).', 20),
    (sch, sec, 'England', 'link', 'Get help with home education from your council', 'https://www.gov.uk/home-schooling-information-council', 'Find your local council''s home education team.', 30),
    (sch, sec, 'England', 'link', 'Deregistration explained (Home Education UK)', 'https://www.home-education.org.uk/legal-dereg.htm', 'A plain-English walk-through of deregistering, from a long-running home education site.', 40),
    (sch, sec, 'England', 'link', 'Deregistration letter template for England and Wales', 'https://educationalfreedom.org.uk/deregistration-letter-england-and-wales/', 'A ready-to-use letter from Educational Freedom. Keep a dated copy.', 50),
    (sch, sec, 'England', 'link', 'Standard letter templates (Education Otherwise)', 'https://www.educationotherwise.org/wp-content/uploads/2020/09/Fact-sheet-standard-letters1.pdf', 'Letters for deregistering and replying to your council (PDF).', 60),
    (sch, sec, 'Wales', 'link', 'Elective home education guidance (Welsh Government)', 'https://www.gov.wales/elective-home-education-guidance', 'Statutory guidance for families and local authorities in Wales.', 70),
    (sch, sec, 'Wales', 'link', 'Home education: handbook for home educators', 'https://www.gov.wales/home-education-handbook-home-educators-html', 'The Welsh Government''s practical handbook for families.', 80),
    (sch, sec, 'Wales', 'link', 'Children''s Wellbeing and Schools Act 2026 and home education in Wales', 'https://www.gov.wales/childrens-wellbeing-and-schools-act-2026-and-elective-home-education-html', 'What the new Act means for families in Wales.', 90),
    (sch, sec, 'Wales', 'link', 'Sample deregistration letters (Wales Home Education)', 'https://www.waleshomeeducation.co.uk/sample-documents.php', 'Template letters written for Welsh families.', 100),
    (sch, sec, 'Scotland', 'link', 'Withdrawing a child from school (Scottish Government)', 'https://www.gov.scot/publications/home-education-guidance-2/pages/3/', 'In Scotland you need the council''s consent to withdraw a child from a state school, and it must not be unreasonably withheld.', 110),
    (sch, sec, 'Scotland', 'link', 'Withdrawing a child from a state school (Schoolhouse)', 'https://www.schoolhouse.org.uk/home-education-and-the-law/withdrawing-a-child-from-a-state-school/', 'Step-by-step help from Scotland''s home education charity.', 120),
    (sch, sec, 'Northern Ireland', 'link', 'Educating your child at home (Education Authority)', 'https://www.eani.org.uk/services/elective-home-education', 'Write to the principal to say you are withdrawing your child. The EA''s home education team can advise: ehe@eani.org.uk.', 130),
    (sch, sec, 'Northern Ireland', 'link', 'Elective home education (Department of Education NI)', 'https://www.education-ni.gov.uk/articles/elective-home-education', 'The department''s information page for Northern Ireland.', 140),
    (sch, sec, 'Northern Ireland', 'link', 'Home Education Northern Ireland (HEdNI)', 'https://hedni.org/', 'Support and community for home educators in Northern Ireland.', 150);
  insert into hub_sections (school_id, slug, title, intro, sort_order) values (sch, 'exams', 'Exams and exam centres', 'Home-educated students sit GCSEs and iGCSEs as private candidates at an approved exam centre. Find your centre before you start studying, so you choose courses it can offer, and book early: centres fill up and set their own deadlines, often well before the exam boards''. Fees are set by each centre.', 20) returning id into sec;
  insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order) values
    (sch, sec, 'When to book for summer 2027', 'date', 'September to October 2026', '', 'Choose subjects and exam boards, then contact centres. Ask early about practicals, speaking exams and access arrangements (allow up to a year for these).', 10),
    (sch, sec, 'When to book for summer 2027', 'date', 'November 2026 to January 2027', '', 'Register with your centre and pay. Many centres close bookings in this window, earlier than the exam boards.', 20),
    (sch, sec, 'When to book for summer 2027', 'date', '21 February 2027', 'https://www.jcq.org.uk/wp-content/uploads/sites/2/2026/05/Key_Dates_June2027_FINAL.pdf', 'Exam boards'' entry deadline for the June 2027 series. Late fees apply from 22 February.', 30),
    (sch, sec, 'When to book for summer 2027', 'date', '22 April 2027', 'https://support.pearson.com/uk/articles/en_US/Knowledge/Entries-UK-Centre-Entry-Deadlines', 'Higher late fees apply from this date (Pearson Edexcel iGCSE).', 40),
    (sch, sec, 'When to book for summer 2027', 'date', '10 May to 18 June 2027', 'https://www.jcq.org.uk/wp-content/uploads/sites/2/2026/05/Key_Dates_June2027_FINAL.pdf', 'GCSE exams on the common timetable. 23 June is the contingency day.', 50),
    (sch, sec, 'When to book for summer 2027', 'date', 'August 2027', '', 'Results day. Your centre tells you how results are collected.', 60),
    (sch, sec, 'Find an exam centre', 'link', 'JCQ: centres that accept private candidates', 'https://www.jcq.org.uk/private-candidates/', 'Search by postcode, exam board and subject. Updated each December or January; always confirm with the centre.', 70),
    (sch, sec, 'Find an exam centre', 'link', 'HE Exams wiki: finding an exam centre', 'https://he-exams.fandom.com/wiki/Finding_an_exam_centre', 'Advice written by home educators: what to ask centres and when.', 80),
    (sch, sec, 'Find an exam centre', 'link', 'Pearson Edexcel: private candidates', 'https://qualifications.pearson.com/en/support/support-for-you/students/private-candidates.html', 'For Edexcel GCSEs and International GCSEs.', 90),
    (sch, sec, 'Find an exam centre', 'link', 'AQA: private candidates', 'https://www.aqa.org.uk/student-support/private-candidates', 'For AQA GCSEs and A-levels.', 100),
    (sch, sec, 'Find an exam centre', 'link', 'Cambridge International: register as a private candidate', 'https://www.cambridgeinternational.org/exam-administration/private-candidates/register-as-a-private-candidate/', 'For Cambridge IGCSEs.', 110),
    (sch, sec, 'Exam centres by region', 'link', 'South and South-East England', 'https://he-exams.fandom.com/wiki/South_and_South-East_England_Exam_Centres', 'Home educators'' list of centres, with fees and notes.', 120),
    (sch, sec, 'Exam centres by region', 'link', 'South West England', 'https://he-exams.fandom.com/wiki/South_West_Exam_Centres', '', 130),
    (sch, sec, 'Exam centres by region', 'link', 'East of England', 'https://he-exams.fandom.com/wiki/East_of_England_Exam_Centres', '', 140),
    (sch, sec, 'Exam centres by region', 'link', 'Midlands', 'https://he-exams.fandom.com/wiki/Midlands_Exam_Centres', '', 150),
    (sch, sec, 'Exam centres by region', 'link', 'Northern England', 'https://he-exams.fandom.com/wiki/Northern_England_-_Exam_Centres', '', 160),
    (sch, sec, 'Exam centres by region', 'link', 'Wales', 'https://he-exams.fandom.com/wiki/Wales', '', 170);
  insert into hub_sections (school_id, slug, title, intro, sort_order) values (sch, 'google-classroom', 'Using Google Classroom', 'Our lessons, homework and messages run through Google Classroom. These short videos show students how to join a class and hand in work, and show parents what they can see.', 30) returning id into sec;
  insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order) values
    (sch, sec, 'For students', 'video', 'How to Join Google Classroom as Student', 'https://www.youtube.com/watch?v=JgfQF7WrkMw', 'EdTech Cafe · 1:47', 10),
    (sch, sec, 'For students', 'video', 'How Students Use Google Classroom', 'https://www.youtube.com/watch?v=X4x4VPOjjrI', 'Teach Tech Tools · 9:37', 20),
    (sch, sec, 'For students', 'video', 'Student''s Guide to Google Classroom', 'https://www.youtube.com/watch?v=VOOnCwWZxX4', 'friEdTechnology · about 11 minutes', 30),
    (sch, sec, 'For students', 'video', 'How to submit assignments in Google Classroom', 'https://www.youtube.com/watch?v=2uamjnanR_w', 'Yearn 2 Learn · 8:08', 40),
    (sch, sec, 'For parents', 'video', 'Google Classroom Parent Summary (What Parents See!)', 'https://www.youtube.com/watch?v=HXt1hUfuAYk', 'Mr. Campbell Rocks · 3:44', 50),
    (sch, sec, 'For parents', 'video', 'Parent Guide to Guardian Email Summaries', 'https://www.youtube.com/watch?v=1-TOCNweIfs', 'Ryan''s Tech Tips · 6:43', 60),
    (sch, sec, 'Google''s own help', 'link', 'Join a class with a class code', 'https://support.google.com/edu/classroom/answer/15605102', 'Google Classroom Help.', 70),
    (sch, sec, 'Google''s own help', 'link', 'Join a class with a class link', 'https://support.google.com/edu/classroom/answer/15604494', 'Google Classroom Help.', 80);
  insert into hub_sections (school_id, slug, title, intro, sort_order) values (sch, 'days-out', 'Days out and activity centres', 'Science centres, museums and historic sites near you. Many offer reduced or free education visits for home-educated groups, so ask when you book.', 40) returning id into sec;
  insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order) values
    (sch, sec, 'Across the UK', 'link', 'Find a science or discovery centre', 'https://www.sciencecentres.org.uk/centres/', 'The Association for Science and Discovery Centres'' map of centres across the UK.', 10),
    (sch, sec, 'Across the UK', 'link', 'English Heritage: free education visits', 'https://www.english-heritage.org.uk/learn/school-visits/free-school-visits/', 'Free self-led visits for education groups. Home educators in an umbrella group qualify; other groups at English Heritage''s discretion. Book at least 7 days ahead.', 20),
    (sch, sec, 'Across the UK', 'link', 'Local home education groups', 'https://www.educationotherwise.org/local-groups/', 'Meet-ups, trips and group activities near you (Education Otherwise).', 30),
    (sch, sec, 'London', 'link', 'Science Museum', 'https://www.sciencemuseum.org.uk/', '', 40),
    (sch, sec, 'London', 'link', 'Natural History Museum', 'https://www.nhm.ac.uk/', '', 50),
    (sch, sec, 'London', 'link', 'Royal Museums Greenwich', 'https://www.rmg.co.uk/', '', 60),
    (sch, sec, 'London', 'link', 'Royal Institution', 'https://www.rigb.org/', '', 70),
    (sch, sec, 'London', 'link', 'Kew Gardens', 'https://www.kew.org/kew-gardens', '', 80),
    (sch, sec, 'South East', 'link', 'Winchester Science Centre & Planetarium', 'https://www.winchestersciencecentre.org/', '', 90),
    (sch, sec, 'South East', 'link', 'Oxford University Museum of Natural History', 'https://www.oum.ox.ac.uk/', '', 100),
    (sch, sec, 'South East', 'link', 'Science Oxford', 'https://scienceoxford.com/', '', 110),
    (sch, sec, 'South East', 'link', 'The Observatory Science Centre, East Sussex', 'https://www.the-observatory.org/', '', 120),
    (sch, sec, 'South East', 'link', 'Look Out Discovery Centre, Bracknell', 'https://www.bracknell-forest.gov.uk/leisure-services/look-out-discovery-centre', '', 130),
    (sch, sec, 'South West', 'link', 'We The Curious, Bristol', 'https://www.wethecurious.org/', '', 140),
    (sch, sec, 'South West', 'link', 'Eden Project, Cornwall', 'https://www.edenproject.com/', '', 150),
    (sch, sec, 'South West', 'link', 'Explorer Dome', 'https://www.explorerdome.co.uk/', '', 160),
    (sch, sec, 'East of England', 'link', 'Cambridge Science Centre', 'https://www.cambridgesciencecentre.org/', '', 170),
    (sch, sec, 'East of England', 'link', 'STEM Discovery Centre, Hertfordshire', 'https://stemdiscoverycentre.co.uk/', '', 180),
    (sch, sec, 'East Midlands', 'link', 'National Space Centre, Leicester', 'https://spacecentre.co.uk/', '', 190),
    (sch, sec, 'East Midlands', 'link', 'National Stone Centre, Derbyshire', 'https://www.nationalstonecentre.org.uk/', '', 200),
    (sch, sec, 'West Midlands', 'link', 'Thinktank, Birmingham Science Museum', 'https://www.birminghammuseums.org.uk/thinktank', '', 210),
    (sch, sec, 'Yorkshire and the Humber', 'link', 'Eureka! The National Children''s Museum, Halifax', 'https://www.eureka.org.uk/', '', 220),
    (sch, sec, 'Yorkshire and the Humber', 'link', 'National Railway Museum, York', 'https://www.nrm.org.uk/', '', 230),
    (sch, sec, 'Yorkshire and the Humber', 'link', 'National Science and Media Museum, Bradford', 'https://www.scienceandmediamuseum.org.uk/', '', 240),
    (sch, sec, 'Yorkshire and the Humber', 'link', 'The Deep, Hull', 'https://www.thedeep.co.uk/', '', 250),
    (sch, sec, 'North West', 'link', 'Jodrell Bank, Cheshire', 'https://www.jodrellbank.net/', '', 260),
    (sch, sec, 'North West', 'link', 'Catalyst Science Discovery Centre, Widnes', 'https://www.catalyst.org.uk/', '', 270),
    (sch, sec, 'North West', 'link', 'Eureka! Science + Discovery, Wirral', 'https://www.eurekadiscovery.org.uk/', '', 280),
    (sch, sec, 'North East', 'link', 'Centre for Life, Newcastle', 'https://www.life.org.uk/', '', 290),
    (sch, sec, 'North East', 'link', 'Kielder Observatory, Northumberland', 'https://kielderobservatory.org/', '', 300),
    (sch, sec, 'Wales', 'link', 'Cadw: free visits for home-educating families', 'https://cadw.gov.wales/visit/places-to-visit/admissions/free-access-schemes', 'Free entry to Cadw''s castles and historic sites for home-educating families.', 310),
    (sch, sec, 'Wales', 'link', 'Techniquest, Cardiff', 'https://www.techniquest.org/', '', 320),
    (sch, sec, 'Wales', 'link', 'Xplore! Science Discovery Centre, Wrexham', 'https://www.xplorescience.co.uk/', '', 330),
    (sch, sec, 'Wales', 'link', 'Centre for Alternative Technology, Machynlleth', 'https://www.cat.org.uk/', '', 340),
    (sch, sec, 'Scotland', 'link', 'Historic Environment Scotland: free self-led learning visits', 'https://www.historicenvironment.scot/learn/learning-resources-and-visits/plan-a-free-self-led-learning-visit/', 'Free learning visits to castles and historic sites. Home education groups are eligible; book ahead.', 350),
    (sch, sec, 'Scotland', 'link', 'Glasgow Science Centre', 'https://www.glasgowsciencecentre.org/', '', 360),
    (sch, sec, 'Scotland', 'link', 'Dynamic Earth, Edinburgh', 'https://www.dynamicearth.co.uk/', '', 370),
    (sch, sec, 'Scotland', 'link', 'Dundee Science Centre', 'https://www.dundeesciencecentre.org.uk/', '', 380),
    (sch, sec, 'Scotland', 'link', 'Aberdeen Science Centre', 'https://aberdeensciencecentre.org/', '', 390),
    (sch, sec, 'Northern Ireland', 'link', 'W5, Belfast', 'https://w5online.co.uk/', '', 400),
    (sch, sec, 'Northern Ireland', 'link', 'Armagh Observatory and Planetarium', 'https://www.armagh.space/', '', 410);
  insert into hub_sections (school_id, slug, title, intro, sort_order) values (sch, 'support', 'Support and community', 'You''re not on your own. These organisations offer advice, helplines and local meet-ups.', 50) returning id into sec;
  insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order) values
    (sch, sec, '', 'link', 'Home Education UK: questions parents ask', 'https://www.home-education.org.uk/faq-carers.htm', 'Answers to the most common questions from new home educators.', 10),
    (sch, sec, '', 'link', 'Education Otherwise: local groups', 'https://www.educationotherwise.org/local-groups/', 'The UK''s longest-running home education charity.', 20),
    (sch, sec, '', 'link', 'Schoolhouse (Scotland)', 'https://www.schoolhouse.org.uk/schoolhouse/about-schoolhouse/', 'Scotland''s home education charity.', 30),
    (sch, sec, '', 'link', 'Wales Home Education: the law', 'https://www.waleshomeeducation.co.uk/the-law.php', 'Home education law in Wales, explained.', 40),
    (sch, sec, '', 'link', 'The national curriculum', 'https://www.gov.uk/national-curriculum', 'You don''t have to follow it, but it''s a useful guide to what children learn at each stage.', 50);
end $$;
