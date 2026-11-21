-- 21 Nov: Resources (/resources): a public page of useful resources for learning at home, grouped by subject
-- (documentaries, websites, books). In the website menu. Managed in Admin → Website → Resources.
create table if not exists site_resources (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  subject     text not null check (length(subject) between 1 and 60),   -- "All subjects" shows last
  title       text not null check (length(title) between 1 and 120),
  description text check (description is null or length(description) <= 400),
  url         text check (url is null or (url ~ '^https://' and length(url) <= 600)),   -- none for a tip (e.g. "watch any documentary")
  kind        text not null default 'website' check (kind in ('website', 'watch', 'listen', 'book', 'tip')),
  sort_order  smallint not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists site_resources_school on site_resources (school_id, subject, sort_order);
grant select, insert, update, delete on site_resources to app_user;
alter table site_resources enable row level security;
drop policy if exists school_isolation on site_resources;
create policy school_isolation on site_resources to app_user using (school_id = current_school()) with check (school_id = current_school());

-- OH-SO ED's first list: Geography from Becky's recommendations to a parent (Nov 2026); the rest are well-known free
-- UK resources for each teacher to check and change in Admin → Website → Resources.
insert into site_resources (school_id, subject, title, description, url, kind, sort_order)
  select s.id, r.subject, r.title, r.description, r.url, r.kind, r.sort_order
  from schools s cross join (values
    ('Geography', 'Watch documentaries about the world', 'Any documentary where you learn about the world can be used as a case study in Geography, not just the ones we teach in lessons.', null, 'tip', 1),
    ('Geography', 'Simon Reeve on BBC iPlayer', 'Simon Reeve''s travel documentaries are full of real places, people and issues. Search for "Simon Reeve" on iPlayer.', 'https://www.bbc.co.uk/iplayer', 'watch', 2),
    ('Geography', 'Wider Watching in Geography', 'Internet Geography''s list of TV programmes and documentaries every geographer should watch.', 'https://www.internetgeography.net/wider-watching-in-geography/', 'watch', 3),
    ('Geography', 'Internet Geography', 'Clear notes and case studies written for GCSE Geography: a better place to start homework research than Wikipedia.', 'https://www.internetgeography.net', 'website', 4),
    ('Geography', 'BBC Bitesize Geography', 'Short revision guides, videos and quizzes for every topic: choose your level, then Geography.', 'https://www.bbc.co.uk/bitesize', 'website', 5),
    ('Maths', 'Corbettmaths', 'Videos, practice questions and the daily "5-a-day" for every topic.', 'https://corbettmaths.com', 'website', 1),
    ('Maths', 'Maths Genie', 'Revision by grade, with exam questions and video solutions.', 'https://www.mathsgenie.co.uk', 'website', 2),
    ('Maths', 'BBC Bitesize Maths', 'Revision guides, videos and quizzes: choose your level, then Maths.', 'https://www.bbc.co.uk/bitesize', 'website', 3),
    ('English', 'Read widely', 'Novels, newspapers and non-fiction: reading for pleasure is the best way to build vocabulary and ideas for writing.', null, 'tip', 1),
    ('English', 'BBC Bitesize English', 'Revision guides for language skills and set texts: choose your level, then English.', 'https://www.bbc.co.uk/bitesize', 'website', 2),
    ('English', 'Mr Bruff on YouTube', 'Popular videos on set texts and exam technique for English Language and Literature.', 'https://www.youtube.com/@mrbruff', 'watch', 3),
    ('Science', 'Cognito', 'Free videos, quizzes and notes for Biology, Chemistry and Physics.', 'https://cognitoedu.org', 'website', 1),
    ('Science', 'Free Science Lessons on YouTube', 'Short, clear videos for every GCSE science topic.', 'https://www.youtube.com/@Freesciencelessons', 'watch', 2),
    ('Science', 'BBC Bitesize Science', 'Revision guides, videos and quizzes.', 'https://www.bbc.co.uk/bitesize/subjects/zrkw2hv', 'website', 3),
    ('History', 'BBC Bitesize History', 'Revision guides and videos: choose your level, then History.', 'https://www.bbc.co.uk/bitesize', 'website', 1),
    ('History', 'You''re Dead to Me', 'The BBC''s comedy history podcast: a historian and a comedian on a different period each episode.', 'https://www.bbc.co.uk/programmes/p07mdbhg', 'listen', 2),
    ('Business', 'BBC Bitesize Business', 'Revision guides and videos.', 'https://www.bbc.co.uk/bitesize/subjects/zpsvr82', 'website', 1),
    ('Business', 'tutor2u Business', 'Short explanations and videos on business ideas, with real examples.', 'https://www.tutor2u.net/business', 'website', 2),
    ('All subjects', 'Seneca', 'Free revision courses and quizzes for most GCSE subjects.', 'https://senecalearning.com', 'website', 1),
    ('All subjects', 'Oak National Academy', 'Free video lessons for KS3 and GCSE.', 'https://www.thenational.academy', 'website', 2),
    ('All subjects', 'Physics & Maths Tutor', 'Past papers, mark schemes and revision notes for many subjects and exam boards.', 'https://www.physicsandmathstutor.com', 'website', 3)
  ) as r(subject, title, description, url, kind, sort_order)
  where s.slug = 'ohsoed' and not exists (select 1 from site_resources x where x.school_id = s.id);
