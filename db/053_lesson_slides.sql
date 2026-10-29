-- A link to each lesson's slides (Google Slides, Drive, Canva, PowerPoint online…), set by the teacher from My day.
alter table lesson_events add column if not exists slides_url text check (slides_url is null or (slides_url ~ '^https://' and char_length(slides_url) <= 600));
