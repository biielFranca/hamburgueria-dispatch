-- orders.address_street was NOT NULL, but an order without a street is
-- legitimate: pickup orders (every platform's normalizer writes null for
-- them) and platform-delivered orders whose address the platform does not
-- share. Found with the 99Food sandbox, 05/out/2026: the insert failed and the
-- webhook answered 500, so every pickup order would have been refused.
--
-- Orders the store delivers itself still need a street — that is the
-- classifier's rule 4 (invalid_address), not a column constraint.

alter table public.orders alter column address_street drop not null;

-- Rollback (only if no row has a null street):
--   alter table public.orders alter column address_street set not null;
