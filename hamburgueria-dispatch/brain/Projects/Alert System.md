# Alert System

## Summary
Background component that polls for overdue orders every 20 seconds and fires audio + visual alerts based on order age. Prevents duplicate alerts per order/level combination within a session.

## Source
- `hamburgueria-dispatch/src/components/AlertSystem/index.tsx`
- `hamburgueria-dispatch/src/lib/alertSound.ts`
- `tasks_v1.md` — Blocos 7 + 8

## Alert Thresholds

| Level | Trigger | Sound | Description |
|-------|---------|-------|-------------|
| `5min` | age >= 5 min | 6 paired pulses, ~3.6s | Early warning |
| `1min` | age >= 9 min | 8 urgent pulses, ~4.2s | Approaching overdue |
| `critical` | age >= 10 min | 12 intense alternating pulses, ~5.4s | Overdue |

## How It Works

### AlertSystem Component
- Runs `setInterval` every 20 seconds
- Queries Supabase: all active orders (not dispatched/cancelled) for the store
- For each order: calculates age from `created_at`
- Checks `firedRef: Set<string>` keyed by `${orderId}-${level}` for deduplication
- If threshold met and not fired: plays sound, shows toast card, adds to firedRef
- Toast auto-dismisses after 7 seconds

### alertSound.ts
Web Audio API-based sounds. No external audio files required.
- Single AudioContext instance (reused across alerts)
- Uses OscillatorNode with envelope (attack/release) for clean sound
- `playAlert(level: '5min' | '1min' | 'critical')` — public API

### Mute Button
Mute state persisted in `localStorage`. Silences audio without disabling visual toasts.

## Known Issues
- firedRef is in-memory only — resets on page reload
- `dispatch_alerts` table exists in DB but may not be used by AlertSystem yet (see [[Pending Work Register]])
- See [[Pending Work Register]] for audio context bug with rapid alerts

## Related Notes
- [[Data Flow]]
- [[Pending Work Register]]
