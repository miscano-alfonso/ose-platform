-- Lessons in any video tool: join records can now come from check-ins on this site (the Join button) and,
-- later, from Zoom's reports, as well as from Google Meet. The school's chosen tool lives in meet_kv ('video').
alter table meet_sessions drop constraint if exists meet_sessions_source_check;
alter table meet_sessions add constraint meet_sessions_source_check check (source in ('attendlist', 'meet_api', 'checkin', 'zoom'));
