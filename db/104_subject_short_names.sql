-- 26 Nov 2026: subjects can have a short name for the dashboards (Alfonso: "English Language is English, English
-- Literature is Literature, Science Double Award is Science"), so class names and the student menu read simpler.
-- The website, reports, emails and admin pages keep the full name. Set on Settings → Course labels.
alter table subjects add column if not exists short_name text check (short_name is null or length(short_name) between 1 and 40);

update subjects set short_name = case name
    when 'English Language' then 'English'
    when 'English Literature' then 'Literature'
    when 'Science Double Award' then 'Science'
  end
  where short_name is null and name in ('English Language', 'English Literature', 'Science Double Award');
