-- Admin → Recordings: the "Weekly Meet Recordings Tracker" Apps Script, moved into the dashboard.
-- Lesson recordings are found in the Google Meet folder by Meet code, renamed to the house convention, filed in their
-- subject folder, transcripts archived, posted to the class's Google Classroom, and given a title card by the
-- existing Cloud Run title-card service. The settings below are copied from the script (Code.gs / TitleCards.gs).

create table if not exists rec_lessons (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  kind        text not null default 'class' check (kind in ('class', 'one')),   -- a class, or a 1:1
  meet_code   text not null check (meet_code ~ '^[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  name        text not null,              -- class: exactly as in the tracker's column A ("GCSE Geography"); 1:1: the label
  course_id   text,                       -- Google Classroom course (numeric id)
  folder_id   text,                       -- class: its subject folder under "2026 Recordings"; 1:1: its "_<label>" folder (made when needed)
  per_week    smallint,                   -- sanity check on lesson numbers (class only)
  year_suffix text check (year_suffix in ('Yr1', 'Yr2')),   -- two-year GCSE courses only
  group_id    uuid references course_groups(id) on delete set null,
  active      boolean not null default true,
  unique (school_id, meet_code)
);

create table if not exists recordings (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id) on delete cascade,
  lesson_id      uuid references rec_lessons(id) on delete set null,
  file_id        text not null,
  raw_name       text,
  name           text,
  recorded_at    timestamptz not null,
  size_bytes     bigint,
  term_number    smallint,
  lesson_number  smallint,
  status         text not null check (status in ('filed', 'short', 'duplicate', 'outside_term', 'unfiled')),
  over_expected  boolean not null default false,
  transcripts    smallint not null default 0,
  -- Classroom: waiting = no teacher post mentioning "Lesson n" yet (retried for 14 days); posted; skipped (no course)
  classroom      text not null default 'waiting' check (classroom in ('waiting', 'posted', 'already', 'no_course', 'error', 'not_needed', 'gave_up')),
  classroom_note text,
  classroom_tries smallint not null default 0,
  force_post     boolean not null default false,
  -- title card
  card_title     text,
  card_teacher   text,
  card_logo      text,
  card_label     text,
  card_term_lesson text,
  card_date      text,
  card_status    text check (card_status in ('awaiting', 'queued', 'processing', 'done', 'error', 'edited')),
  card_note      text,
  card_key       text,               -- what the preview was made from
  card_preview   bytea,
  card_started_at timestamptz,
  card_redo      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (school_id, file_id)
);
create index if not exists recordings_lesson on recordings (school_id, lesson_id, term_number);
create index if not exists recordings_recent on recordings (school_id, recorded_at desc);

grant select, insert, update, delete on rec_lessons, recordings to app_user;
alter table rec_lessons enable row level security;
alter table recordings enable row level security;
drop policy if exists school_isolation on rec_lessons;
create policy school_isolation on rec_lessons to app_user using (school_id = current_school()) with check (school_id = current_school());
drop policy if exists school_isolation on recordings;
create policy school_isolation on recordings to app_user using (school_id = current_school()) with check (school_id = current_school());

-- The script's settings for OH-SO ED (2026-27)
do $$ declare sch uuid; begin
  select id into sch from schools where slug = 'ohsoed'; if sch is null then return; end if;
  insert into rec_lessons (school_id, kind, meet_code, name, course_id, folder_id, per_week, year_suffix) values
    (sch, 'class', 'tio-musg-jxi', 'KS3 English',           '864879941208', '1EIW0cBUQG3-IAXtO9JXUO9OgDP5WRtGS', 1, null),
    (sch, 'class', 'ter-ptat-mvy', 'KS3 Literature',        '875996327064', '1WfD6j2BVMK52A8o0R_0iWxYBqwH1fTk7', 1, null),
    (sch, 'class', 'uzi-xgoe-rnm', 'KS3 Maths',             '870603407406', '1Fn5tKn_VLrVZxQWsKLiGF7GjnP_aDHdv', 1, null),
    (sch, 'class', 'ydy-dksn-bgn', 'Pre-GCSE Business',     '826123746520', '1mHlrgqM011GBaSvR8oRFuZqq_i1V8tum', 1, null),
    (sch, 'class', 'dej-uocg-fhy', 'Pre-GCSE History',      '826123467081', '1-mXLy-4kNHsSH5NVySkstvadgadUFb4m', 1, null),
    (sch, 'class', 'zpf-pqgj-arr', 'Pre-GCSE Literature',   '875996638737', '1WfD6j2BVMK52A8o0R_0iWxYBqwH1fTk7', 1, null),
    (sch, 'class', 'per-bfey-kji', 'Pre-GCSE English',      '826123296945', '1EIW0cBUQG3-IAXtO9JXUO9OgDP5WRtGS', 2, null),
    (sch, 'class', 'vji-qyvf-byd', 'Pre-GCSE Maths',        '875998142851', '1Fn5tKn_VLrVZxQWsKLiGF7GjnP_aDHdv', 2, null),
    (sch, 'class', 'iqv-ewyv-wep', 'Pre-GCSE Science',      '875998042654', '1U2hOM9a6myGmUmh2R32LPNxGfOAixlKJ', 2, null),
    (sch, 'class', 'fbd-brdn-faq', 'GCSE Biology',          '876005000913', '1q3YjeUrd6TLQUmsLLTctGAOKQQfgxN2n', 3, null),
    (sch, 'class', 'vbr-bhfv-kpk', 'GCSE English',          '826123642309', '1EIW0cBUQG3-IAXtO9JXUO9OgDP5WRtGS', 3, null),
    (sch, 'class', 'jom-orjm-isp', 'GCSE Literature',       '875996368975', '1WfD6j2BVMK52A8o0R_0iWxYBqwH1fTk7', 3, null),
    (sch, 'class', 'smu-ekqg-qyf', 'GCSE History',          '826124057701', '1-mXLy-4kNHsSH5NVySkstvadgadUFb4m', 2, 'Yr1'),
    (sch, 'class', 'kgr-vkvg-hjy', 'GCSE Business',         '826123469462', '1mHlrgqM011GBaSvR8oRFuZqq_i1V8tum', 2, 'Yr1'),
    (sch, 'class', 'whc-vfvu-crb', 'GCSE Geography',        '876004288795', '1JNazU3-Lxw2Mu4HCpvhJQ3gOGwCKCuNb', 2, 'Yr1'),
    (sch, 'class', 'wza-iwxb-fbs', 'GCSE Maths Foundation', '876004337095', '1Fn5tKn_VLrVZxQWsKLiGF7GjnP_aDHdv', 2, 'Yr1'),
    (sch, 'class', 'ncu-oofr-aya', 'GCSE Maths Higher',     '875995224642', '1Fn5tKn_VLrVZxQWsKLiGF7GjnP_aDHdv', 2, 'Yr1'),
    (sch, 'class', 'fbh-njhs-ckc', 'GCSE Science Double',   '876002656347', '1U2hOM9a6myGmUmh2R32LPNxGfOAixlKJ', 2, 'Yr1'),
    (sch, 'one',   'owq-ycya-qxk', 'Luke Withers - GCSE Chemistry', '877671600090', null, null, null),
    (sch, 'one',   'bfk-orcb-qjb', 'Zach Otton - English',  '887681490803', null, null, null),
    (sch, 'one',   'bcf-rhqa-hcq', 'Zach Otton - Maths',    '887682783958', null, null, null),
    (sch, 'one',   'hsf-jcuz-mfv', 'Zach Otton - History',  '887683282789', null, null, null)
  on conflict (school_id, meet_code) do nothing;
  -- link each class to the dashboard's class by its Meet link
  update rec_lessons r set group_id = g.id from course_groups g join academic_years y on y.id = g.academic_year_id
    where r.school_id = sch and g.school_id = sch and y.ends_on >= current_date and r.kind = 'class'
      and replace(lower(g.meet_url), '-', '') like '%' || replace(r.meet_code, '-', '') || '%';
  -- folders and the title-card settings (the service URL and secret are entered in the dashboard, never stored here)
  insert into meet_kv (school_id, key, value) values (sch, 'rec_cfg', jsonb_build_object(
    'meetFolder', '109qYLnino36STg9DE0wV0CBfROA_KqIs', 'transcriptsFolder', '1liE2TS8iP98U2dfZg7CdTTn2ITm8XW7R',
    'flaggedFolder', '1qZi9RdfSI2DKD-XNSc1Ua7Pf0vAJE_7h', 'oneToOneFolder', '1Kb6Y_hYBYjOe7XHtddIqt1E56GzSak2E',
    'minBytes', 5242880, 'cardSeconds', 4, 'cardParallel', 4, 'cardStuckMinutes', 60, 'autoCards', true,
    'roundels', jsonb_build_array(
      jsonb_build_array('Literature', '11VTktbk7MFvYyKY3eJAChcDVSY-ehDE8'), jsonb_build_array('English', '11VTktbk7MFvYyKY3eJAChcDVSY-ehDE8'),
      jsonb_build_array('Maths', '11RXG3q00rje6sfF7Clh1Aa638PyUM6R-'), jsonb_build_array('Biology', '11U-b9aIsOpP7pJEnUqF6WX1QVTKdU_oP'),
      jsonb_build_array('Chemistry', '11U-b9aIsOpP7pJEnUqF6WX1QVTKdU_oP'), jsonb_build_array('Physics', '11U-b9aIsOpP7pJEnUqF6WX1QVTKdU_oP'),
      jsonb_build_array('Science', '11U-b9aIsOpP7pJEnUqF6WX1QVTKdU_oP'), jsonb_build_array('History', '11DPbUuPBWpNI6wEOFMcKO3aL2e-Ft9v6'),
      jsonb_build_array('Geography', '11RSTk8VYx9IZS_P_CDswSnVTK7z-W58b'), jsonb_build_array('Business', '11RyFYc5hJ20UJdEC4Hyu1F_r5-gLEA1C')),
    'defaultLogo', '1Bi3NSQfLVAUff2s2bpOX0eiyNxjZwq-U'))
  on conflict (school_id, key) do nothing;
end $$;
