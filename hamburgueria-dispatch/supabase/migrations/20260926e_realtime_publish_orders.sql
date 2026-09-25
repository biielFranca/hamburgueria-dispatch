-- Roadmap 1.6 — new-order alert depends on Realtime INSERT events on orders.
--
-- Found 26/set/2026: the supabase_realtime publication has NO tables, so every
-- postgres_changes subscription in the app (AlertSystem, Operational, Orders,
-- Cardápio, Estoque) silently receives nothing; screens only refresh by polling.
--
-- Only `orders` is published here (the one the alert needs). Side effect to
-- watch: the front-end classifier re-updates 'normalized' orders every 60 s
-- (roadmap 1.2), and each UPDATE now triggers a fetchAll() in the Operational
-- screen (roadmap 2.2). Other tables stay unpublished until 1.2/2.2.
--
-- Rollback: alter publication supabase_realtime drop table public.orders;

alter publication supabase_realtime add table public.orders;
