// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('alertSound', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('isMuted returns false by default', async () => {
    const { isMuted } = await import('./alertSound')
    expect(isMuted()).toBe(false)
  })

  it('isMuted returns true when localStorage has mute=true', async () => {
    localStorage.setItem('dispatch_alert_muted', 'true')
    const { isMuted } = await import('./alertSound')
    expect(isMuted()).toBe(true)
  })

  it('setMuted persists to localStorage', async () => {
    const { setMuted } = await import('./alertSound')
    setMuted(true)
    expect(localStorage.getItem('dispatch_alert_muted')).toBe('true')
    setMuted(false)
    expect(localStorage.getItem('dispatch_alert_muted')).toBe('false')
  })

  it('setMuted dispatches alert-mute-changed event', async () => {
    const { setMuted } = await import('./alertSound')
    const listener = vi.fn()
    window.addEventListener('alert-mute-changed', listener)
    setMuted(true)
    expect(listener).toHaveBeenCalledTimes(1)
    const call = listener.mock.calls[0][0] as CustomEvent
    expect(call.detail).toEqual({ muted: true })
    window.removeEventListener('alert-mute-changed', listener)
  })

  it('toggleMute flips state and returns new value', async () => {
    const { toggleMute, isMuted } = await import('./alertSound')
    expect(isMuted()).toBe(false)
    const first = toggleMute()
    expect(first).toBe(true)
    expect(isMuted()).toBe(true)
    const second = toggleMute()
    expect(second).toBe(false)
    expect(isMuted()).toBe(false)
  })

  it('playAlert is a no-op when muted', async () => {
    const { playAlert, setMuted } = await import('./alertSound')
    setMuted(true)
    const AudioSpy = vi.fn()
    vi.stubGlobal('Audio', AudioSpy)
    playAlert('5min')
    expect(AudioSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
