/**
 * Alert deduplication helpers.
 *
 * Pure functions extracted to simplify testing. The AlertSystem component
 * tracks which order IDs have already been alerted at each level to avoid
 * replaying the same sound when realtime events re-fire.
 */

import type { AlertLevel } from './alertSound'

export type AlertKey = `${string}:${AlertLevel}`

export function alertKey(orderId: string, level: AlertLevel): AlertKey {
  return `${orderId}:${level}` as AlertKey
}

/**
 * Returns true if `order:level` has NOT been seen before. Mutates `seen`
 * to record the new key.
 */
export function markIfNew(seen: Set<AlertKey>, orderId: string, level: AlertLevel): boolean {
  const key = alertKey(orderId, level)
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

/**
 * Remove all alert entries for orders that no longer exist in `activeOrderIds`.
 * Called when the order list changes so dismissed/completed orders don't
 * permanently block their own keys.
 */
export function pruneAlerts(seen: Set<AlertKey>, activeOrderIds: Iterable<string>): Set<AlertKey> {
  const active = new Set(activeOrderIds)
  const next = new Set<AlertKey>()
  for (const key of seen) {
    const orderId = key.split(':')[0]
    if (active.has(orderId)) next.add(key)
  }
  return next
}

/**
 * Pick the highest-severity level that applies to an order based on ms since creation.
 * Returns null when none apply.
 */
export function levelFromAge(
  ageMs: number,
  thresholds: { warning: number; urgent: number; overdue: number },
): AlertLevel | null {
  if (ageMs >= thresholds.overdue) return 'critical'
  if (ageMs >= thresholds.urgent) return '1min'
  if (ageMs >= thresholds.warning) return '5min'
  return null
}
