/**
 * Driver GPS (stub).
 *
 * The actual GPS stream comes from a future mobile companion app that writes
 * to public.drivers (last_lat, last_lng, last_seen_at, gps_enabled). This
 * module exposes:
 *
 *   - isDriverOnline(driver)     — true if last ping ≤ STALE_MS
 *   - formatLastSeen(driver)     — human-friendly "há 2 min" / "offline"
 *   - toggleGpsEnabled(driverId) — operator flips the driver's opt-in flag
 *   - updateDriverLocation(...)  — placeholder used by mobile app bridge
 *
 * Until the mobile app exists, coordinates stay null and the UI renders a
 * "GPS desativado — aguardando app do motoboy" placeholder.
 */

import { supabase } from './supabase'
import type { Driver } from '../types'

const STALE_MS = 3 * 60_000 // 3 min without a ping → treat as offline

export function isDriverOnline(driver: Driver): boolean {
  if (!driver.gps_enabled) return false
  if (!driver.last_seen_at) return false
  return Date.now() - new Date(driver.last_seen_at).getTime() < STALE_MS
}

export function formatLastSeen(driver: Driver): string {
  if (!driver.gps_enabled)   return 'GPS desativado'
  if (!driver.last_seen_at)  return 'Aguardando primeiro ping'
  const diffMs  = Date.now() - new Date(driver.last_seen_at).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)   return 'agora'
  if (diffMin < 60)  return `há ${diffMin} min`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr  < 24)  return `há ${diffHr} h`
  return 'offline'
}

export async function toggleGpsEnabled(driverId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ gps_enabled: enabled })
    .eq('id', driverId)
  if (error) throw error
}

/**
 * Called by the mobile app bridge (Tauri command / Supabase Edge function)
 * to persist a GPS fix. Exposed here so the desktop can also simulate it
 * during QA.
 */
export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number,
): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({
      last_lat:     lat,
      last_lng:     lng,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', driverId)
  if (error) throw error
}
