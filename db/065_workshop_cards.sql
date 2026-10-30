-- "More" page (was Other services): each workshop can have a picture (uploaded in the admin, kept here) and a card size
-- on the website: single (one column) or double (two columns, picture beside the words).
alter table workshops
  add column if not exists image bytea,
  add column if not exists image_type text,
  add column if not exists image_updated_at timestamptz,
  add column if not exists card_size text not null default 'single' check (card_size in ('single', 'double'));

-- the Narnia workshop from ohsoed.co.uk: its picture (public/workshops/narnia.webp), a double card, and the wording from the old site
update workshops set image_url = coalesce(image_url, '/workshops/narnia.webp'), card_size = 'double',
  summary = 'This workshop will introduce students to C.S. Lewis’ novel The Chronicles of Narnia. We will take a journey through Narnia’s characters, plot and fantastical setting, delivered through fun and interactive activities.'
where slug = 'the-chronicles-of-narnia-workshop';

-- Past paper marking requests from the website: an enquiry of kind 'marking' with the child, the subject and the paper itself
alter table enquiries drop constraint if exists enquiries_kind_check;
alter table enquiries add constraint enquiries_kind_check check (kind in ('contact', 'taster', 'marking'));
alter table enquiries
  add column if not exists child_name text,
  add column if not exists subject text,
  add column if not exists file bytea,
  add column if not exists file_name text,
  add column if not exists file_type text;
