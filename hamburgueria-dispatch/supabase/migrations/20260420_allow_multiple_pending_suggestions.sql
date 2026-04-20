-- Allow multiple pending_review suggestions per store.
-- Previously a partial unique index limited each store to one open suggestion,
-- which blocked parallel dispatch (operator assigning different groups to
-- different motoboys at the same time). Drop the index.

DROP INDEX IF EXISTS public.dispatch_suggestions_one_pending;
