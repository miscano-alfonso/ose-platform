-- 27 Nov (Alfonso: "Forgotten your password?" for Leanne showed the setup-key page): admins can be emailed a link to
-- set a new password. The links live with the teachers' sign-in links, marked by what they're for.
alter table staff_links add column if not exists purpose text not null default 'sign_in';
alter table staff_links drop constraint if exists staff_links_purpose_check;
alter table staff_links add constraint staff_links_purpose_check check (purpose in ('sign_in', 'reset'));
