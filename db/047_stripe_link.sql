-- Stripe payments made under another email (or as a guest) are linked to the family by the card used
-- (the same card as one of the family's other payments) or by the name on the payment.
alter table stripe_charges add column if not exists card_fp text;        -- Stripe's card fingerprint (not the card number)
alter table stripe_charges add column if not exists card_last4 text;
alter table stripe_charges add column if not exists payer_name text;
alter table stripe_charges add column if not exists linked_by text;      -- 'email' / 'card' / 'name' / 'hand'
create index if not exists stripe_charges_fp on stripe_charges (school_id, card_fp) where card_fp is not null;
