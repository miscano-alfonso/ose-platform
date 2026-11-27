-- 27 Nov (Alfonso: "can the visitors log all visits, even not signed in ones?"): each introduction-page view also keeps
-- the kind of device and browser (from the browser's own description; no IP address) and whether it was school staff.
alter table nd_page_views add column if not exists device text;
alter table nd_page_views add column if not exists staff boolean not null default false;
