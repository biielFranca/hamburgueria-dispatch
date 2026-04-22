// Recency window shared by the Operational map and the Orders list.
//
// Active orders older than this threshold drop off the live views and live
// only in Relatórios. Avoids stale-queue buildup when a platform replays
// historical data (e.g. Cardápio Web polling backfill on first connect).

export const ACTIVE_ORDER_MAX_AGE_HOURS = 8
export const ACTIVE_ORDER_MAX_AGE_MS = ACTIVE_ORDER_MAX_AGE_HOURS * 60 * 60 * 1000

/** ISO cutoff for `created_at >= ...` Supabase filters. */
export function activeOrderCutoffIso(now: number = Date.now()): string {
  return new Date(now - ACTIVE_ORDER_MAX_AGE_MS).toISOString()
}
