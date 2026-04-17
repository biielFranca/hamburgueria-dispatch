import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Order, Store } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const DISPATCH_GHOST_MS = 60_000

// ── Order map state type ──────────────────────────────────────────────────────

export type OrderMarkerState = {
  platformColor: string  // brand color — border when outline, fill when filled
  opacity:       number
  label:         string  // stop number for selected suggestion
  filled:        boolean // true → fill balloon; false → dark bg + colored border
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 160
}

// ── Icon factories ────────────────────────────────────────────────────────────

function storeIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:34px;height:34px;background:#ffffff;
        border:3px solid #111;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:17px;box-shadow:0 3px 10px rgba(0,0,0,.8);
      ">🏠</div>`,
    iconSize:    [34, 34],
    iconAnchor:  [17, 17],
    tooltipAnchor: [17, 0],
  })
}

/**
 * Speech-bubble marker.
 * Shape: rounded-rect body + downward triangle tail.
 * - filled=false → dark bg (#171717), platformColor border + text
 * - filled=true  → platformColor bg, white (or black) text
 * - label overrides the order code when set (stop number)
 */
function orderIcon(
  code:          string,
  platformColor: string,
  filled:        boolean,
  label:         string,
  opacity:       number,
): L.DivIcon {
  const bg     = filled ? platformColor : '#171717'
  const border = platformColor
  const text   = filled ? (isLight(platformColor) ? '#000' : '#fff') : platformColor
  const display = label || code

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:inline-block;opacity:${opacity};">
        <div style="
          width:50px;height:26px;
          background:${bg};
          border:2.5px solid ${border};
          border-radius:6px;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:800;color:${text};
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          box-shadow:0 2px 8px rgba(0,0,0,.65);
          white-space:nowrap;overflow:hidden;
          box-sizing:border-box;letter-spacing:-.2px;
        ">${display}</div>
        <div style="
          position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:6px solid transparent;border-right:6px solid transparent;
          border-top:9px solid ${border};
        "></div>
        <div style="
          position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:4px solid transparent;border-right:4px solid transparent;
          border-top:6px solid ${bg};
        "></div>
      </div>`,
    iconSize:   [50, 35],
    iconAnchor: [25, 35],
  })
}

// ── Fit bounds once ───────────────────────────────────────────────────────────

function FitBoundsOnce({ positions }: { positions: [number, number][] }) {
  const map    = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || positions.length === 0) return
    fitted.current = true
    try {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])))
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true })
    } catch { /* ignore */ }
  }, [positions.length > 0]) // eslint-disable-line

  return null
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OperationalMapProps {
  store:              Store | null
  orders:             Order[]
  markerStates:       Map<string, OrderMarkerState>
  routeCoords:        [number, number][]
  onOrderCtrlClick?:  (orderId: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperationalMap({
  store,
  orders,
  markerStates,
  routeCoords,
  onOrderCtrlClick,
}: OperationalMapProps) {
  const defaultCenter: [number, number] = [-23.55052, -46.633308]
  const center: [number, number] =
    store?.latitude != null && store?.longitude != null
      ? [store.latitude, store.longitude]
      : defaultCenter

  const allPositions: [number, number][] = []
  if (store?.latitude != null && store?.longitude != null) {
    allPositions.push([store.latitude, store.longitude])
  }
  for (const order of orders) {
    if (order.latitude != null && order.longitude != null) {
      allPositions.push([order.latitude, order.longitude])
    }
  }

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: '100%', width: '100%', background: '#0f0f0f' }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      {routeCoords.length >= 2 && (
        <Polyline
          positions={routeCoords}
          pathOptions={{ color: '#facc15', weight: 2.5, opacity: 0.85, dashArray: '9 5' }}
        />
      )}

      {store?.latitude != null && store?.longitude != null && (
        <Marker
          position={[store.latitude, store.longitude]}
          icon={storeIcon()}
          zIndexOffset={1000}
        />
      )}

      {orders
        .filter(o => o.latitude != null && o.longitude != null)
        .map(order => {
          const state = markerStates.get(order.id) ?? {
            platformColor: '#666677',
            opacity: 1,
            label: '',
            filled: false,
          }
          return (
            <Marker
              key={order.id}
              position={[order.latitude!, order.longitude!]}
              icon={orderIcon(
                order.platform_order_code ?? '#???',
                state.platformColor,
                state.filled,
                state.label,
                state.opacity,
              )}
              zIndexOffset={state.label ? 500 : 0}
              eventHandlers={{
                click: (e) => {
                  if (e.originalEvent.ctrlKey && onOrderCtrlClick) {
                    onOrderCtrlClick(order.id)
                  }
                },
              }}
            />
          )
        })}

      <FitBoundsOnce positions={allPositions} />
    </MapContainer>
  )
}
