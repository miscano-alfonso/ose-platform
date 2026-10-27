-- OH-SO EdTech trial requests: whether the school already uses Google Workspace (the platform is built around Meet and Classroom).
alter table edtech_trials add column if not exists google text not null default '';
