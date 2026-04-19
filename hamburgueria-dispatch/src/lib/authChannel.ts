/**
 * Cross-tab auth synchronization via BroadcastChannel.
 *
 * When a user logs out in one tab, all other tabs receive the event and
 * react (sign out + reload). Same for login so session state stays aligned.
 */

export type AuthChannelEvent =
  | { type: 'signed_out'; at: number }
  | { type: 'signed_in';  at: number }

const CHANNEL_NAME = 'dispatch-auth'

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}

export function broadcastAuth(event: AuthChannelEvent): void {
  getChannel()?.postMessage(event)
}

export function subscribeAuth(handler: (event: AuthChannelEvent) => void): () => void {
  const ch = getChannel()
  if (!ch) return () => {}
  const listener = (e: MessageEvent<AuthChannelEvent>) => handler(e.data)
  ch.addEventListener('message', listener)
  return () => ch.removeEventListener('message', listener)
}

export function closeAuthChannel(): void {
  channel?.close()
  channel = null
}
