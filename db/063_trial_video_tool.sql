-- OH-SO EdTech self-serve trials: the video tool they teach with (Google Meet, Zoom, Teams…), asked on /osedtech/trial
-- and set as the new school's live-lesson tool (School settings → Live lessons) when it opens.
alter table edtech_trials add column if not exists video text not null default '';
