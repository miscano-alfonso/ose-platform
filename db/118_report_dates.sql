-- 27 Nov (Alfonso: "where can i edit dates for each bi-termly report?"): the office can set when teachers can start
-- submitting a round (blank = the Monday of the last week of term, as before).
alter table report_cycles add column if not exists submit_opens date;
