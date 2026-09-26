// Pure iFood event rules — no Supabase, no fetch, no Deno APIs, so the same
// file runs in Edge Functions and in Vitest.

export interface IfoodEvent {
  id:          string
  code?:       string
  fullCode?:   string
  orderId?:    string
  merchantId?: string
  createdAt?:  string
}

// iFood sends the short code (PLC) in `code` and the long one in `fullCode`.
export function isPlaced(ev: IfoodEvent): boolean {
  return ev.code === 'PLC' || ev.fullCode === 'PLACED'
}

/** Presence heartbeat sent to the webhook every 30 s; carries no order. */
export function isKeepalive(ev: IfoodEvent): boolean {
  return ev.code === 'KEEPALIVE' || ev.fullCode === 'KEEPALIVE'
}

// Events that end an order on iFood → our terminal status. Without this a
// cancelled or concluded order stayed open in our DB forever.
export function terminalStatus(ev: IfoodEvent): 'cancelled' | 'delivered' | null {
  if (ev.code === 'CAN' || ev.fullCode === 'CANCELLED') return 'cancelled'
  if (ev.code === 'CON' || ev.fullCode === 'CONCLUDED') return 'delivered'
  return null
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time: the loop always walks the full length, so timing does not
// reveal how many leading characters matched.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * X-IFood-Signature = hex(HMAC-SHA256(client_secret, raw body)).
 * Must run on the raw bytes, before any JSON parsing.
 */
export async function verifyIfoodSignature(
  secret: string,
  rawBody: Uint8Array<ArrayBuffer>,
  signature: string | null,
): Promise<boolean> {
  if (!secret || !signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = toHex(await crypto.subtle.sign('HMAC', key, rawBody))
  return safeEqual(expected, signature.trim().toLowerCase())
}
