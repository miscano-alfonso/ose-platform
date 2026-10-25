-- "Space Available" on the homepage: automatic (open classes with places left), or set by hand per class
alter table course_groups add column if not exists homepage text not null default 'auto'
  check (homepage in ('auto', 'show', 'hide'));
alter table course_groups add column if not exists homepage_order smallint;
