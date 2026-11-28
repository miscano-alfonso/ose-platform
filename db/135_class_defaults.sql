-- 28 Nov (Alfonso): one Capacity and one "Sign-ups needed to open" for every class (Admin → Classes → Defaults), which a
-- class can override. A class following the default changes with it; a class with its own number keeps it.
alter table schools add column if not exists default_class_capacity smallint not null default 12 check (default_class_capacity between 1 and 200);
alter table schools add column if not exists default_waitlist_threshold smallint not null default 5 check (default_waitlist_threshold between 1 and 99);
grant update (default_class_capacity, default_waitlist_threshold) on schools to app_user;
alter table course_groups add column if not exists capacity_custom boolean;
alter table course_groups add column if not exists threshold_custom boolean;
-- existing classes: a number different from the defaults counts as the class's own
update course_groups g set capacity_custom = g.capacity is distinct from s.default_class_capacity from schools s where s.id = g.school_id and g.capacity_custom is null;
update course_groups g set threshold_custom = g.waitlist_threshold <> s.default_waitlist_threshold from schools s where s.id = g.school_id and g.threshold_custom is null;
alter table course_groups alter column capacity_custom set default false, alter column capacity_custom set not null;
alter table course_groups alter column threshold_custom set default false, alter column threshold_custom set not null;
