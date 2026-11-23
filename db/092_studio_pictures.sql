-- 23 Nov: Sketch Studio keeps a picture of each drawing (a JPEG of what the page drew, plus a small one for lists),
-- so Social can use a drawing for a post without downloading and uploading it.
alter table studio_drawings add column if not exists pic bytea;
alter table studio_drawings add column if not exists pic_small bytea;
alter table studio_drawings add column if not exists pic_w integer;
alter table studio_drawings add column if not exists pic_h integer;
alter table studio_drawings add column if not exists pic_at timestamptz;
