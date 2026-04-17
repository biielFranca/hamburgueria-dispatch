export type Platform = 'ifood' | '99food' | 'cardapio_web' | 'keeta'

export type UserRole = 'owner' | 'admin' | 'operator'

export type DeliveryType = 'delivery' | 'pickup'

export type LogisticsType = 'own' | 'platform'

export type OrderStatus =
  | 'received'
  | 'normalized'
  | 'awaiting_route'
  | 'in_suggestion'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'dispatch_timeout'

export type RouteEligibility =
  | 'eligible'
  | 'awaiting'
  | 'blocked'
  | 'external_monitoring'

export type SuggestionStatus =
  | 'pending_review'
  | 'accepted'
  | 'edited'
  | 'rejected'
  | 'dispatched'
  | 'requeued'

export interface Store {
  id: string
  name: string
  address: string
  phone?: string
  latitude?: number
  longitude?: number
  active: boolean
  created_at: string
}

export interface UserPermissions {
  operational: boolean
  orders: boolean
  drivers: boolean
}

export interface User {
  id: string
  store_id: string
  auth_id: string
  name: string
  username: string
  role: UserRole
  active: boolean
  permissions?: UserPermissions
  created_at: string
  last_login_at?: string
}

export interface Driver {
  id: string
  store_id: string
  name: string
  active: boolean
  created_at: string
}

export interface OrderItem {
  name: string
  quantity: number
  unit_price: number
  total_price: number
  notes?: string
}

export interface Order {
  id: string
  store_id: string
  platform: Platform
  platform_order_id: string
  platform_order_code?: string
  customer_name: string
  customer_phone?: string
  address_street: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_city?: string
  address_zip?: string
  latitude?: number
  longitude?: number
  items: OrderItem[]
  total_amount: number
  payment_method?: string
  delivery_type: DeliveryType
  logistics_type: LogisticsType
  status: OrderStatus
  route_eligibility?: RouteEligibility
  route_block_reason?: string
  rejection_count: number
  estimated_delivery_at?: string
  dispatched_at?: string
  created_at: string
  updated_at: string
}

export interface DispatchSuggestion {
  id: string
  store_id: string
  assigned_driver_id?: string
  status: SuggestionStatus
  suggested_sequence: string[]
  predicted_eta?: number
  suggestion_version: number
  original_suggestion?: any
  rejection_reason?: string
  reviewed_by?: string
  created_at: string
  reviewed_at?: string
  orders?: Order[]
  driver?: Driver
}
