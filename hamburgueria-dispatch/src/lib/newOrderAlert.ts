/**
 * New-order alert rules.
 *
 * Pure functions used by AlertSystem to decide whether a Realtime INSERT on
 * `orders` should ring, and when a pending new-order alert can stop repeating.
 */

import type { OrderStatus } from '../types'

/** Orders that reached us longer ago than this don't ring (avoids a burst of stale alerts). */
export const NEW_ORDER_MAX_AGE_MS = 2 * 60_000

/** How often the chime repeats while a new order is still unacknowledged. */
export const NEW_ORDER_REPEAT_MS = 30_000

// Once an order is out the door (or gone) nobody needs to be called about it
const CLOSED_STATUSES: ReadonlySet<OrderStatus> = new Set(['dispatched', 'delivered', 'cancelled'])

export function isOrderClosed(status: OrderStatus): boolean {
  return CLOSED_STATUSES.has(status)
}

interface NewOrderRow {
  status:      OrderStatus
  created_at:  string
  updated_at?: string | null
}

/**
 * When the order reached our database. On an INSERT payload `updated_at` is the
 * insert time; `created_at` is the platform's order time (iFood sends the moment
 * the customer ordered), so an order synced late must not be judged by it.
 */
function arrivedAt(order: NewOrderRow): number {
  return Date.parse(order.updated_at ?? order.created_at)
}

export function shouldAlertNewOrder(
  order: NewOrderRow,
  now: number,
  maxAgeMs = NEW_ORDER_MAX_AGE_MS,
): boolean {
  if (isOrderClosed(order.status)) return false
  const arrived = arrivedAt(order)
  // Unknown time → ring: a spurious chime is cheaper than a forgotten order.
  // Negative age (local clock behind the server) also counts as fresh.
  if (Number.isNaN(arrived)) return true
  return now - arrived <= maxAgeMs
}
