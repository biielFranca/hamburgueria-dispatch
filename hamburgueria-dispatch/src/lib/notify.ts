/**
 * Desktop / browser notifications.
 *
 * Uses the Web Notification API (works in WebView2 on Windows). Wrapped so
 * the rest of the app doesn't branch on permission state.
 */

const PREF_KEY = 'dispatch_notifications_enabled'

export function isNotificationSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  const result = await Notification.requestPermission()
  return result
}

/** User preference (on top of OS permission). */
export function isNotificationsEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) !== 'false' // default ON
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, String(enabled))
  window.dispatchEvent(new CustomEvent('dispatch-notifications-changed', { detail: { enabled } }))
}

export interface NotifyOptions {
  title: string
  body?: string
  tag?:  string   // de-dupe: same tag replaces prior notification
  icon?: string
  silent?: boolean
  onClick?: () => void
}

export function notify(opts: NotifyOptions): Notification | null {
  if (!isNotificationSupported()) return null
  if (Notification.permission !== 'granted') return null
  if (!isNotificationsEnabled()) return null

  try {
    const n = new Notification(opts.title, {
      body:   opts.body,
      tag:    opts.tag,
      icon:   opts.icon,
      silent: opts.silent,
    })
    if (opts.onClick) {
      n.onclick = () => {
        window.focus()
        opts.onClick!()
        n.close()
      }
    }
    return n
  } catch {
    return null
  }
}
