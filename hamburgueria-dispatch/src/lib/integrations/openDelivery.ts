/**
 * Open Delivery integration is backend-only.
 * Frontend never performs OAuth/client_secret flows directly.
 */

import { supabase } from '../supabase'

type OdPlatform = '99food' | 'keeta'

interface PlatformConfig {
  platform: OdPlatform
  backendKey: OdPlatform
  alwaysPlatformLogistics: boolean
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    platform: '99food',
    backendKey: '99food',
    alwaysPlatformLogistics: false,
  },
  {
    platform: 'keeta',
    backendKey: 'keeta',
    alwaysPlatformLogistics: true,
  },
]

function getConfig(platform: OdPlatform): PlatformConfig {
  const config = PLATFORM_CONFIGS.find(c => c.platform === platform)
  if (!config) throw new Error(`Unknown platform: ${platform}`)
  return config
}

function extractError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const value = (data as { error?: unknown }).error
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

export async function handleOpenDeliveryWebhook(
  platform: OdPlatform,
  payload: unknown,
  storeId: string,
  signature?: string,
): Promise<void> {
  if (!storeId.trim()) throw new Error('storeId invalido')
  const config = getConfig(platform)

  const { data, error } = await supabase.functions.invoke('open-delivery-webhook', {
    body: {
      platform: config.backendKey,
      storeId: storeId.trim(),
      payload,
      signature,
    },
  })

  if (error) {
    throw new Error(`Falha no backend open-delivery-webhook: ${error.message}`)
  }
  if (data && typeof data === 'object' && 'ok' in data && (data as any).ok === false) {
    throw new Error(extractError(data, 'Falha ao processar webhook Open Delivery'))
  }
}

export async function confirmOpenDeliveryDispatch(
  platform: OdPlatform,
  platformOrderId: string,
): Promise<void> {
  const orderId = platformOrderId.trim()
  if (!orderId) throw new Error('platformOrderId invalido')
  const config = getConfig(platform)

  const { data, error } = await supabase.functions.invoke('open-delivery-dispatch-confirm', {
    body: {
      platform: config.backendKey,
      platformOrderId: orderId,
    },
  })

  if (error) {
    throw new Error(`Falha no backend open-delivery-dispatch-confirm: ${error.message}`)
  }
  if (data && typeof data === 'object' && 'ok' in data && (data as any).ok === false) {
    throw new Error(extractError(data, 'Falha ao confirmar despacho Open Delivery'))
  }
}

export async function pollOpenDeliveryEvents(
  platform: OdPlatform,
  storeId: string,
  merchantId: string,
): Promise<void> {
  if (!storeId.trim()) throw new Error('storeId invalido')
  if (!merchantId.trim()) throw new Error('merchantId invalido')
  const config = getConfig(platform)

  const { data, error } = await supabase.functions.invoke('open-delivery-sync', {
    body: {
      platform: config.backendKey,
      storeId: storeId.trim(),
      merchantId: merchantId.trim(),
    },
  })

  if (error) {
    throw new Error(`Falha no backend open-delivery-sync: ${error.message}`)
  }
  if (data && typeof data === 'object' && 'ok' in data && (data as any).ok === false) {
    throw new Error(extractError(data, 'Falha ao sincronizar Open Delivery'))
  }
}

export { PLATFORM_CONFIGS }
