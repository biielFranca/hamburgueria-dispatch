import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { isPlaced, isKeepalive, terminalStatus, verifyIfoodSignature } from './ifoodEvents'

const SECRET = 'test-secret'
const body = (s: string) => new TextEncoder().encode(s)
const sign = (s: string, secret = SECRET) => createHmac('sha256', secret).update(s).digest('hex')

describe('verifyIfoodSignature', () => {
  const payload = '{"id":"a1","code":"PLC","fullCode":"PLACED","orderId":"o1","merchantId":"m1"}'

  it('accepts the HMAC-SHA256 hex of the raw body', async () => {
    expect(await verifyIfoodSignature(SECRET, body(payload), sign(payload))).toBe(true)
  })

  it('accepts an uppercase hex signature', async () => {
    expect(await verifyIfoodSignature(SECRET, body(payload), sign(payload).toUpperCase())).toBe(true)
  })

  it('rejects a signature made with another secret', async () => {
    expect(await verifyIfoodSignature(SECRET, body(payload), sign(payload, 'other'))).toBe(false)
  })

  it('rejects when the body was re-serialized (bytes differ)', async () => {
    const reordered = '{"code":"PLC","id":"a1","fullCode":"PLACED","orderId":"o1","merchantId":"m1"}'
    expect(await verifyIfoodSignature(SECRET, body(reordered), sign(payload))).toBe(false)
  })

  it('rejects a missing signature or secret', async () => {
    expect(await verifyIfoodSignature(SECRET, body(payload), null)).toBe(false)
    expect(await verifyIfoodSignature('', body(payload), sign(payload))).toBe(false)
  })

  it('rejects a truncated signature', async () => {
    expect(await verifyIfoodSignature(SECRET, body(payload), sign(payload).slice(0, 10))).toBe(false)
  })
})

describe('event classification', () => {
  it('recognizes placed orders by short or full code', () => {
    expect(isPlaced({ id: '1', code: 'PLC' })).toBe(true)
    expect(isPlaced({ id: '1', fullCode: 'PLACED' })).toBe(true)
    expect(isPlaced({ id: '1', code: 'CFM', fullCode: 'CONFIRMED' })).toBe(false)
  })

  it('recognizes the presence heartbeat', () => {
    expect(isKeepalive({ id: '1', code: 'KEEPALIVE', fullCode: 'KEEPALIVE' })).toBe(true)
    expect(isKeepalive({ id: '1', code: 'PLC' })).toBe(false)
  })

  it('maps cancellation and conclusion to terminal statuses', () => {
    expect(terminalStatus({ id: '1', code: 'CAN' })).toBe('cancelled')
    expect(terminalStatus({ id: '1', fullCode: 'CANCELLED' })).toBe('cancelled')
    expect(terminalStatus({ id: '1', code: 'CON' })).toBe('delivered')
    expect(terminalStatus({ id: '1', fullCode: 'CONCLUDED' })).toBe('delivered')
    expect(terminalStatus({ id: '1', code: 'CFM' })).toBeNull()
    // Cancellation *request* is not final — the order may still go out
    expect(terminalStatus({ id: '1', code: 'CAR', fullCode: 'CANCELLATION_REQUESTED' })).toBeNull()
  })
})
