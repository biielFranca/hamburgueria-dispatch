export type Platform = 'ifood' | '99food' | 'cardapio_web' | 'keeta' | 'aiqfome'

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
  logo_url?: string | null
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
  last_lat?:     number | null
  last_lng?:     number | null
  last_seen_at?: string | null
  gps_enabled?:  boolean
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
  /**
   * Canal de origem real do pedido quando vem via agregador.
   * Ex.: Cardápio Web consolida iFood/99Food/Keeta/site próprio — este campo
   * traz o `salesChannel` do payload Open Delivery (IFOOD, 99FOOD, KEETA,
   * DELIVERYHUB, PARTNER, OWN_SITE, etc). Null para pedidos diretos.
   */
  source_channel?: string | null
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

// ── Catalog domain ─────────────────────────────────────────────────────────────

export interface CatalogCategory {
  id:         string
  store_id:   string
  name:       string
  sort_order: number
  active:     boolean
  created_at: string
}

export interface CatalogItem {
  id:           string
  store_id:     string
  category_id:  string | null
  name:         string
  description:  string | null
  price:        number
  active:       boolean
  created_at:   string
  updated_at:   string
  category?:    CatalogCategory
  availability?: ItemAvailabilityState
  aliases?:     CatalogItemAlias[]
}

export interface CatalogItemAlias {
  id:              string
  catalog_item_id: string
  store_id:        string
  alias:           string
  created_at:      string
}

export interface PlatformItemMapping {
  id:              string
  store_id:        string
  catalog_item_id: string
  platform:        Platform
  external_code:   string
  external_name:   string | null
  created_at:      string
}

export interface ItemAvailabilityState {
  id:              string
  catalog_item_id: string
  store_id:        string
  available:       boolean
  reason:          string | null
  paused_until:    string | null
  updated_at:      string
}

// ── Inventory domain ───────────────────────────────────────────────────────────

export interface InventoryItem {
  id:           string
  store_id:     string
  name:         string
  unit:         string
  quantity:     number
  min_quantity: number
  created_at:   string
  updated_at:   string
}

export interface StockMovement {
  id:                 string
  store_id:           string
  inventory_item_id:  string
  quantity:           number
  movement_type:      'sale' | 'manual_in' | 'manual_out' | 'adjustment' | 'waste'
  reference_id:       string | null
  notes:              string | null
  actor_type:         string
  actor_id:           string | null
  created_at:         string
}

export interface ItemComponent {
  id:                 string
  store_id:           string
  catalog_item_id:    string
  inventory_item_id:  string
  quantity_used:      number
  created_at:         string
}
