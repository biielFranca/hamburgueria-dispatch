-- Driver GPS tracking (stub).
-- Fields populated by a future mobile companion app. Desktop reads them to
-- show last known position on the operational map.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS last_lat      double precision NULL,
  ADD COLUMN IF NOT EXISTS last_lng      double precision NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz      NULL,
  ADD COLUMN IF NOT EXISTS gps_enabled   boolean          NOT NULL DEFAULT false;

COMMENT ON COLUMN public.drivers.last_lat     IS 'Last known GPS latitude (from mobile app).';
COMMENT ON COLUMN public.drivers.last_lng     IS 'Last known GPS longitude (from mobile app).';
COMMENT ON COLUMN public.drivers.last_seen_at IS 'Timestamp of last GPS ping from the driver app.';
COMMENT ON COLUMN public.drivers.gps_enabled  IS 'Whether the driver opted in to live GPS tracking.';

-- Indexing last_seen_at for fast "stale drivers" queries.
CREATE INDEX IF NOT EXISTS idx_drivers_last_seen_at
  ON public.drivers(store_id, last_seen_at DESC)
  WHERE gps_enabled = true;
