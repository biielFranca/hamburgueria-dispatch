/**
 * Alert sound system.
 *
 * Plays audio files from /public/sounds/ with a playback queue to prevent
 * simultaneous overlapping sounds. Mute state persists in localStorage.
 *
 * Files expected in /public/sounds/:
 *   alert-5min.mp3    — light tone (warning)
 *   alert-1min.mp3    — medium urgent tone
 *   alert-critical.mp3 — strong critical tone
 *   new-order.mp3     — chime for a newly received order
 *
 * Falls back to Web Audio API synthesis if files are not found (404).
 */

export type AlertLevel = '5min' | '1min' | 'critical'
export type AlertSound = AlertLevel | 'new_order'

const SOUND_FILES: Record<AlertSound, string> = {
  '5min':      '/sounds/alert-5min.mp3',
  '1min':      '/sounds/alert-1min.mp3',
  'critical':  '/sounds/alert-critical.mp3',
  'new_order': '/sounds/new-order.mp3',
}

const MUTE_KEY = 'dispatch_alert_muted'

// ── Mute state ────────────────────────────────────────────────────────────────

export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === 'true'
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, String(muted))
  window.dispatchEvent(new CustomEvent('alert-mute-changed', { detail: { muted } }))
}

export function toggleMute(): boolean {
  const next = !isMuted()
  setMuted(next)
  return next
}

// ── Playback queue ────────────────────────────────────────────────────────────

let playing = false
const queue: AlertSound[] = []

function dequeue() {
  if (playing || queue.length === 0) return
  const level = queue.shift()!
  playing = true
  playImmediate(level).finally(() => {
    playing = false
    dequeue()
  })
}

async function playImmediate(level: AlertSound): Promise<void> {
  // Try file first
  try {
    const audio = new Audio(SOUND_FILES[level])
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('audio file error'))
      audio.play().catch(reject)
    })
    return
  } catch {
    // Fall back to Web Audio API synthesis
    playFallback(level)
  }
}

// Single module-level AudioContext — Chromium caps concurrent contexts at 6
// and creating a new one per beep leaks (close() is deferred via setTimeout
// and fails if a new playback starts inside the window). One context, reused.
let sharedCtx: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC()
  if (sharedCtx.state === 'suspended') { void sharedCtx.resume() }
  return sharedCtx
}

function playFallback(level: AlertSound) {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    // Each level: array of { freq, vol, dur } pulses played in sequence
    // Minimum total duration: 5min ≥ 3s, 1min ≥ 4s, critical ≥ 5s
    const PATTERNS: Record<AlertSound, { freq: number; vol: number; dur: number; gap: number }[]> = {
      '5min': [
        // 3 moderate double-beeps, total ≈ 3.6s
        { freq: 520, vol: 0.30, dur: 0.35, gap: 0.15 },
        { freq: 560, vol: 0.30, dur: 0.35, gap: 0.45 },
        { freq: 520, vol: 0.30, dur: 0.35, gap: 0.15 },
        { freq: 560, vol: 0.30, dur: 0.35, gap: 0.45 },
        { freq: 520, vol: 0.30, dur: 0.35, gap: 0.15 },
        { freq: 560, vol: 0.30, dur: 0.35, gap: 0 },
      ],
      '1min': [
        // Urgent repeating beeps, total ≈ 4.2s
        { freq: 700, vol: 0.50, dur: 0.25, gap: 0.10 },
        { freq: 750, vol: 0.50, dur: 0.25, gap: 0.30 },
        { freq: 700, vol: 0.50, dur: 0.25, gap: 0.10 },
        { freq: 750, vol: 0.50, dur: 0.25, gap: 0.30 },
        { freq: 700, vol: 0.50, dur: 0.25, gap: 0.10 },
        { freq: 750, vol: 0.50, dur: 0.25, gap: 0.30 },
        { freq: 700, vol: 0.55, dur: 0.30, gap: 0.10 },
        { freq: 800, vol: 0.55, dur: 0.30, gap: 0 },
      ],
      'critical': [
        // Intense alarm pattern, total ≈ 5.4s
        { freq: 880, vol: 0.70, dur: 0.20, gap: 0.08 },
        { freq: 660, vol: 0.70, dur: 0.20, gap: 0.08 },
        { freq: 880, vol: 0.70, dur: 0.20, gap: 0.08 },
        { freq: 660, vol: 0.70, dur: 0.20, gap: 0.28 },
        { freq: 880, vol: 0.70, dur: 0.20, gap: 0.08 },
        { freq: 660, vol: 0.70, dur: 0.20, gap: 0.08 },
        { freq: 880, vol: 0.70, dur: 0.20, gap: 0.08 },
        { freq: 660, vol: 0.70, dur: 0.20, gap: 0.28 },
        { freq: 900, vol: 0.75, dur: 0.20, gap: 0.08 },
        { freq: 680, vol: 0.75, dur: 0.20, gap: 0.08 },
        { freq: 900, vol: 0.75, dur: 0.20, gap: 0.08 },
        { freq: 680, vol: 0.75, dur: 0.20, gap: 0 },
      ],
      'new_order': [
        // Ascending three-note chime played twice, total ≈ 2.6s — melodic so it
        // is never confused with the delay beeps above
        { freq: 784,  vol: 0.45, dur: 0.22, gap: 0.06 },
        { freq: 988,  vol: 0.45, dur: 0.22, gap: 0.06 },
        { freq: 1175, vol: 0.50, dur: 0.45, gap: 0.40 },
        { freq: 784,  vol: 0.45, dur: 0.22, gap: 0.06 },
        { freq: 988,  vol: 0.45, dur: 0.22, gap: 0.06 },
        { freq: 1175, vol: 0.50, dur: 0.45, gap: 0 },
      ],
    }

    const pulses = PATTERNS[level]
    const oscType: OscillatorType =
      level === 'critical' ? 'square' : level === 'new_order' ? 'triangle' : 'sine'
    let t = ctx.currentTime + 0.05

    for (const { freq, vol, dur, gap } of pulses) {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = oscType
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.015)
      gain.gain.setValueAtTime(vol, t + dur - 0.03)
      gain.gain.linearRampToValueAtTime(0, t + dur)
      osc.start(t)
      osc.stop(t + dur)
      t += dur + gap
    }

    // do NOT close — shared context is reused across plays
  } catch {
    // AudioContext unavailable — silently ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function playAlert(level: AlertSound): void {
  if (isMuted()) return
  // Several orders arriving together should chime once, not once per order
  if (level === 'new_order' && queue.includes('new_order')) return
  queue.push(level)
  dequeue()
}
