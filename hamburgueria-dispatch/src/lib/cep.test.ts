import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchAddressByCep } from './cep'

describe('fetchAddressByCep', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects CEPs with fewer than 8 digits', async () => {
    await expect(fetchAddressByCep('1234567')).rejects.toThrow('CEP deve ter 8 dígitos')
  })

  it('rejects CEPs with more than 8 digits', async () => {
    await expect(fetchAddressByCep('123456789')).rejects.toThrow('CEP deve ter 8 dígitos')
  })

  it('strips non-digits before validation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logradouro: 'Rua X',
        bairro: 'Centro',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    const result = await fetchAddressByCep('01310-100')
    expect(result.street).toBe('Rua X')
    expect(mockFetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01310100/json/')
  })

  it('throws when ViaCEP returns erro:true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ erro: true }),
    }))
    await expect(fetchAddressByCep('00000000')).rejects.toThrow('CEP não encontrado')
  })

  it('throws when HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    await expect(fetchAddressByCep('01310100')).rejects.toThrow('Erro ao consultar CEP')
  })

  it('maps ViaCEP fields correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logradouro: 'Av. Paulista',
        bairro: 'Bela Vista',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    }))
    const r = await fetchAddressByCep('01310100')
    expect(r).toEqual({
      street: 'Av. Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    })
  })

  it('defaults to empty strings when ViaCEP omits fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logradouro: 'Rua Y' }),
    }))
    const r = await fetchAddressByCep('01310100')
    expect(r.street).toBe('Rua Y')
    expect(r.neighborhood).toBe('')
    expect(r.city).toBe('')
    expect(r.state).toBe('')
  })
})
