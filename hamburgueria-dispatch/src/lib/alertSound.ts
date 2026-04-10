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
 *
 * Falls back to Web Audio API synthesis if files are not found (404).
 */

export type AlertLevel = '5min' | '1min' | 'critical'

const SOUND_FILES: Record<AlertLevel, string> = {
  '5min':     '/sounds/alert-5min.mp3',
  '1min':     '/sounds/alert-1min.mp3',
  'critical': '/sounds/alert-critical.mp3',
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
const queue: AlertLevel[] = []

function dequeue() {
  if (playing || queue.length === 0) return
  const level = queue.shift()!
  playing = true
  playImmediate(level).finally(() => {
    playing = false
    dequeue()
  })
}

async function playImmediate(level: AlertLevel): Promise<void> {
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

function playFallback(level: AlertLevel) {
  try {
    const ctx = new AudioContext()
    const configs = {
      '5min':     { freq: 520, vol: 0.25, count: 1, gap: 0,    dur: 0.25 },
      '1min':     { freq: 700, vol: 0.45, count: 2, gap: 0.28, dur: 0.18 },
      'critical': { freq: 900, vol: 0.65, count: 3, gap: 0.20, dur: 0.14 },
    }
    const { freq, vol, count, gap, dur } = configs[level]

    for (let i = 0; i < count; i++) {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = level === 'critical' ? 'square' : 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * (dur + gap)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.start(t)
      osc.stop(t + dur)
    }

    setTimeout(() => ctx.close(), (count * (dur + gap) + 1) * 1000)
  } catch {
    // AudioContext unavailable — silently ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function playAlert(level: AlertLevel): void {
  if (isMuted()) return
  queue.push(level)
  dequeue()
}
