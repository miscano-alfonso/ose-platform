-- 28 Nov (Alfonso): shorter subject names on the admin screens: English Language → English, English Literature →
-- Literature, Science Double Award → Science. Only where no short name has been set (Settings → Course labels).
update subjects set short_name = 'English' where name = 'English Language' and coalesce(short_name, '') = '';
update subjects set short_name = 'Literature' where name = 'English Literature' and coalesce(short_name, '') = '';
update subjects set short_name = 'Science' where name ilike 'Science%Double%' and coalesce(short_name, '') = '';
