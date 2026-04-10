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

    // Each level: array of { freq, vol, dur } pulses played in sequence
    // Minimum total duration: 5min ≥ 3s, 1min ≥ 4s, critical ≥ 5s
    const PATTERNS: Record<AlertLevel, { freq: number; vol: number; dur: number; gap: number }[]> = {
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
    }

    const pulses = PATTERNS[level]
    const oscType: OscillatorType = level === 'critical' ? 'square' : 'sine'
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

    setTimeout(() => ctx.close(), (t - ctx.currentTime + 1) * 1000)
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
