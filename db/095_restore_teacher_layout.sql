-- 25 Nov 2026: put back OH-SO ED's standard teacher My day, which was reset to the built-in layout by mistake.
-- Exactly as it was saved (read from the live page just before the reset). Leaves it alone if a standard has been saved since.
insert into meet_kv (school_id, key, value)
select s.id, 'dash_std:teacher-home', '[
  {"id":"hero","size":"xl"},
  {"id":"messages","size":"m","h":"m"},
  {"id":"week","size":"m","h":"m"},
  {"id":"stream","size":"m","h":"m"},
  {"id":"email","size":"m","h":"m"},
  {"id":"k-attendance","size":"s","h":"s"},
  {"id":"k-ones","size":"s","h":"s"},
  {"id":"reports-pop","size":"m","h":"s"},
  {"id":"chats","size":"m"},
  {"id":"rewards","size":"m"},
  {"id":"reports","size":"m"}
]'::jsonb
from schools s where s.slug = 'ohsoed'
on conflict (school_id, key) do nothing;
