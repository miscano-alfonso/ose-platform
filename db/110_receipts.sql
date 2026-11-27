-- 27 Nov (Alfonso): parents' Payment history links each payment to its Stripe receipt. Stripe's charge carries the
-- receipt's address; it's kept here when charges are read (and looked up once, on demand, for older ones).
alter table stripe_charges add column if not exists receipt_url text;
