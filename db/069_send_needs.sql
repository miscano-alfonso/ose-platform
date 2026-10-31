-- SEND (31 Oct): which needs, as short labels (ADHD, Autism, Dyslexia…) shown to teachers next to the student's name.
alter table student_support add column if not exists needs text[] not null default '{}';
