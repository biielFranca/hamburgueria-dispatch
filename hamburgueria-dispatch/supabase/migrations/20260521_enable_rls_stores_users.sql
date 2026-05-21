-- Enable RLS on core tenant tables now that same-store policies exist.
--
-- Existing policies use SECURITY DEFINER helpers (`auth_store_id`, `auth_role`)
-- to avoid recursive reads on public.users.

alter table public.stores enable row level security;
alter table public.users enable row level security;
