-- Catalog domain: operational menu of the store.
-- catalog_items      → canonical sellable items
-- catalog_categories → grouping
-- catalog_item_aliases → name variants (fuzzy matching from platforms)
-- platform_item_mapping → external platform product IDs → catalog_item
-- item_availability_state → current operational availability per item

-- ── catalog_categories ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_categories (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid  NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name       text  NOT NULL,
  sort_order int   NOT NULL DEFAULT 0,
  active     bool  NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_categories_name_store
  ON public.catalog_categories (store_id, name);

-- ── catalog_items ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_items (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid    REFERENCES public.catalog_categories(id) ON DELETE SET NULL,
  name        text    NOT NULL,
  description text    NULL,
  price       numeric(10,2) NOT NULL DEFAULT 0,
  active      bool    NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_items_store ON public.catalog_items (store_id, active);

-- ── catalog_item_aliases ──────────────────────────────────────────────────────
-- Name variants used by platforms (e.g. "X-Burger Duplo" on iFood vs "X Burguer" internally).
-- Used for fuzzy matching when identifying order items.

CREATE TABLE IF NOT EXISTS public.catalog_item_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  alias           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_item_aliases_unique
  ON public.catalog_item_aliases (store_id, alias);

-- ── platform_item_mapping ─────────────────────────────────────────────────────
-- Maps a platform's externalCode to a catalog_item.
-- Populated manually or via future sync.

CREATE TABLE IF NOT EXISTS public.platform_item_mapping (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  platform        text NOT NULL,          -- 'ifood' | '99food' | 'keeta' | 'cardapio_web'
  external_code   text NOT NULL,          -- platform's product id / externalCode
  external_name   text NULL,              -- platform's product name (for reference)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_mapping_unique
  ON public.platform_item_mapping (store_id, platform, external_code);

-- ── item_availability_state ───────────────────────────────────────────────────
-- Current operational availability per item.
-- Updated by stock deduction triggers and manual operator action.

CREATE TABLE IF NOT EXISTS public.item_availability_state (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid    NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  store_id        uuid    NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  available       bool    NOT NULL DEFAULT true,
  reason          text    NULL,  -- 'manual_pause' | 'stock_rupture' | 'platform_sync'
  paused_until    timestamptz NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS item_availability_unique
  ON public.item_availability_state (store_id, catalog_item_id);

-- ── RLS for catalog tables ────────────────────────────────────────────────────

ALTER TABLE public.catalog_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_item_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_availability_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_categories','catalog_items','catalog_item_aliases',
    'platform_item_mapping','item_availability_state'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_store_all ON public.%I;
       CREATE POLICY %I_store_all ON public.%I FOR ALL TO authenticated
         USING (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()))
         WITH CHECK (store_id IN (SELECT store_id FROM public.users WHERE auth_id = auth.uid()));',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ── Trigger: update catalog_items.updated_at ─────────────────────────────────

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS catalog_items_updated_at ON public.catalog_items;
CREATE TRIGGER catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

COMMENT ON TABLE public.catalog_items          IS 'Canonical sellable items for the store.';
COMMENT ON TABLE public.catalog_item_aliases   IS 'Name variants for fuzzy platform matching.';
COMMENT ON TABLE public.platform_item_mapping  IS 'Platform externalCode → catalog_item mapping.';
COMMENT ON TABLE public.item_availability_state IS 'Current operational availability per item.';
