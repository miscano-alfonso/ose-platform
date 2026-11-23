-- 23 Nov: subjects take the brand sheet's main colours (as the website's roundels and Sketch Studio already do), so Social's
-- pictures, dashboards, the timetable and emails match. From now on they're set in Settings → Subject colours. Real schools only.
update subjects set colour = case
    when name ~* 'english' then '#008cdb' when name ~* 'math' then '#14af7c' when name ~* 'geograph' then '#ff914d'
    when name ~* 'histor' then '#804ac2' when name ~* '(science|biolog|chemist|physic)' then '#cdc100' when name ~* 'business' then '#9fb4cd'
    when name ~* '(media|film)' then '#cf65a6' when name ~* 'econom' then '#506fa6' when name ~* '(comput|technolog|\mict\M)' then '#0cc0df' end
  where school_id in (select id from schools where not is_demo)
    and name ~* '(english|math|geograph|histor|science|biolog|chemist|physic|business|media|film|econom|comput|technolog|\mict\M)';
