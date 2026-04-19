import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodeOrderAddress } from './geocoder'

describe('geocodeOrderAddress', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when street is empty', async () => {
    const r = await geocodeOrderAddress('', '100', 'Centro', 'SP', '01000000')
    expect(r).toBeNull()
  })

  it('returns null when street is whitespace-only', async () => {
    const r = await geocodeOrderAddress('   ', null, null, null, null)
    expect(r).toBeNull()
  })

  it('returns structured result when first query succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-23.55', lon: '-46.63' }],
    }))
    const r = await geocodeOrderAddress('Av Paulista', '1000', 'Bela Vista', 'São Paulo', '01310100')
    expect(r).toEqual({ latitude: -23.55, longitude: -46.63, source: 'nominatim_structured' })
  })

  it('falls back to freetext when structured returns empty', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })                     // structured: empty
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '-23.5', lon: '-46.6' }] }) // freetext: hit
    vi.stubGlobal('fetch', mockFetch)

    const r = await geocodeOrderAddress('Rua X', '10', 'Centro', 'SP', '01000000')
    expect(r?.source).toBe('nominatim_freetext')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns null when both strategies fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const r = await geocodeOrderAddress('Rua Z', null, null, null, null)
    expect(r).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const r = await geocodeOrderAddress('Rua W', '10', 'Centro', 'SP', '01000000')
    expect(r).toBeNull()
  })

  it('returns null when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }))
    const r = await geocodeOrderAddress('Rua V', null, null, null, null)
    expect(r).toBeNull()
  })

  it('strips non-digits from postalcode in structured query', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-23.5', lon: '-46.6' }],
    })
    vi.stubGlobal('fetch', mockFetch)
    await geocodeOrderAddress('Rua A', '10', null, 'SP', '01310-100')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('postalcode=01310100')
  })
})
