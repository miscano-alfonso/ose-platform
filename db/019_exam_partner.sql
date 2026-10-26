-- Exams section: OH-SO ED partners with Tutors & Exams for exam centres, so list only their centres and dates (checked October 2026).
do $$ declare sch uuid; sec uuid; begin
  select id into sch from schools where slug = 'ohsoed'; if sch is null then return; end if;
  select id into sec from hub_sections where school_id = sch and slug = 'exams'; if sec is null then return; end if;
  update hub_sections set title = 'Exams and exam centres', intro = 'Home-educated students sit GCSEs and iGCSEs as private candidates. We partner with Tutors & Exams, who run exam centres across England for private candidates: you apply and pay online, and your timetable, joining instructions and results come through their Candidate Hub (TECH). Choose your subjects early and book before the deadlines below to avoid late fees.' where id = sec;
  delete from hub_links where section_id = sec;
  insert into hub_links (school_id, section_id, grp, kind, title, url, description, sort_order) values
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Tutors & Exams', 'https://www.tutorsandexams.uk/', 'OH-SO ED''s exam partner for private candidates.', 10),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Book your exams', 'https://www.tutorsandexams.uk/apply/', 'Apply online with your subjects, exam board and specification codes. Entries are made once the invoice is paid.', 20),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'How sitting exams works', 'https://www.tutorsandexams.uk/exam-centres/', 'From applying and paying to your timetable, exam day, results and certificates.', 30),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Which exams can I sit?', 'https://www.tutorsandexams.uk/exam-centres/what-exams-can-I-sit/', 'Qualifications and exam boards available.', 40),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Fees and exam boards', 'https://www.tutorsandexams.uk/fees-and-awarding-body/', '', 50),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Entry deadlines', 'https://www.tutorsandexams.uk/exam-centres/entry-deadline-dates/', 'Every series, with the dates late fees start.', 60),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Access arrangements', 'https://www.tutorsandexams.uk/access-arrangements/', 'Extra time and other support. These have their own, earlier deadlines, so start early.', 70),
    (sch, sec, 'Our exam partner: Tutors & Exams', 'link', 'Questions and contact', 'https://www.tutorsandexams.uk/faq/', 'Tutors & Exams FAQs. Phone 03300 438 772.', 80),
    (sch, sec, 'When to book for summer 2027', 'date', 'Now', '', 'Choose subjects and exam boards with us. If your child may need access arrangements, start these first.', 90),
    (sch, sec, 'When to book for summer 2027', 'date', '7 February 2027', 'https://www.tutorsandexams.uk/exam-centres/entry-deadline-dates/', 'Tutors & Exams entry deadline for summer 2027 (all UK and international qualifications). Late fees apply from 8 February.', 100),
    (sch, sec, 'When to book for summer 2027', 'date', '29 March 2027', 'https://www.tutorsandexams.uk/', 'Entries close for subjects with a modern foreign language speaking test.', 110),
    (sch, sec, 'When to book for summer 2027', 'date', '4 April 2027', 'https://www.tutorsandexams.uk/', 'All other entries close, or sooner if a centre is full.', 120),
    (sch, sec, 'When to book for summer 2027', 'date', '12 to 30 April 2027', 'https://www.tutorsandexams.uk/', 'Speaking test window for language subjects. The dates can''t be changed, so keep them free.', 130),
    (sch, sec, 'When to book for summer 2027', 'date', 'May to June 2027', '', 'Written exams. Your timetable and joining instructions arrive through the Tutors & Exams Candidate Hub (TECH). Arrive 30 minutes early with photo ID.', 140),
    (sch, sec, 'When to book for summer 2027', 'date', 'August 2027', '', 'Results through TECH, about two months after the last exam. Certificates are posted about 15 weeks later.', 150),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Birmingham', 'https://www.tutorsandexams.uk/birmingham-exam-centre/', '', 160),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Bolton', 'https://www.tutorsandexams.uk/bolton/', '', 170),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Coventry', 'https://www.tutorsandexams.uk/coventry/', '', 180),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Doncaster', 'https://www.tutorsandexams.uk/doncaster-exam-centre/', '', 190),
    (sch, sec, 'Tutors & Exams centres', 'link', 'High Wycombe', 'https://www.tutorsandexams.uk/high-wycombe-exam-centre/', '', 200),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Mitcham', 'https://www.tutorsandexams.uk/mitcham/', '', 210),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Newcastle', 'https://www.tutorsandexams.uk/newcastle-exam-centre/', '', 220),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Romford', 'https://www.tutorsandexams.uk/romford-exam-centre/', '', 230),
    (sch, sec, 'Tutors & Exams centres', 'link', 'St Neots', 'https://www.tutorsandexams.uk/st-neots/', '', 240),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Taunton', 'https://www.tutorsandexams.uk/taunton/', '', 250),
    (sch, sec, 'Tutors & Exams centres', 'link', 'Southampton (Wessex Tutors)', 'https://www.tutorsandexams.uk/wessex-tutors-and-exam-centre/', '', 260),
    (sch, sec, 'Science practical labs', 'link', 'Bolton Science Lab', 'https://www.tutorsandexams.uk/bolton-science-lab/', 'For science practical endorsements.', 270),
    (sch, sec, 'Science practical labs', 'link', 'Coventry Science Lab (King Henry VIII)', 'https://www.tutorsandexams.uk/coventry-science-lab/', '', 280),
    (sch, sec, 'Science practical labs', 'link', 'Norwood School, London', 'https://www.tutorsandexams.uk/norwood-school/', '', 290),
    (sch, sec, 'Science practical labs', 'link', 'Sutton High School Science Lab', 'https://www.tutorsandexams.uk/sutton-high-school-science-lab/', '', 300),
    (sch, sec, 'Science practical labs', 'link', 'Taunton Science Lab (Queen''s College)', 'https://www.tutorsandexams.uk/taunton-queens-college/', '', 310);
end $$;
