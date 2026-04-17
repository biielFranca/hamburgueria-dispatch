import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Order, Store } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const DISPATCH_GHOST_MS = 60_000

// ── Order map state type ──────────────────────────────────────────────────────

export type OrderMarkerState = {
  borderColor: string
  fillColor:   string
  opacity:     number
  label:       string
  dashed?:     boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 160
}

function isHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color)
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
 * - border color represents the platform
 * - middle black ring separates platform border from inner fill
 * - fill color represents the current map status
 * - label overrides the order code when set (stop number)
 */
function orderIcon(
  code:        string,
  borderColor: string,
  fillColor:   string,
  label:       string,
  opacity:     number,
  dashed = false,
): L.DivIcon {
  const bg     = fillColor
  const border = borderColor
  const text   = isHexColor(fillColor) && isLight(fillColor) ? '#0b0b0b' : '#ffffff'
  const display = label || code
  const outerBorderCss = dashed ? `2px dashed ${border}` : `2.5px solid ${border}`

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:inline-block;opacity:${opacity};">
        <div style="
          width:50px;height:26px;
          border:${outerBorderCss};
          border-radius:6px;
          background:transparent;
          padding:1px;
          box-shadow:0 2px 8px rgba(0,0,0,.65);
          box-sizing:border-box;
        ">
          <div style="
            width:100%;height:100%;
            border:1px solid #000;
            border-radius:4px;
            background:${bg};
            display:flex;align-items:center;justify-content:center;
            font-size:10px;font-weight:800;color:${text};
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            white-space:nowrap;overflow:hidden;
            box-sizing:border-box;letter-spacing:-.2px;
          ">${display}</div>
        </div>
        <div style="
          position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:7px solid transparent;border-right:7px solid transparent;
          border-top:10px solid ${border};
        "></div>
        <div style="
          position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:6px solid transparent;border-right:6px solid transparent;
          border-top:8px solid #000;
        "></div>
        <div style="
          position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:5px solid transparent;border-right:5px solid transparent;
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

// ── Pan to coord ──────────────────────────────────────────────────────────────

function PanTo({ coord }: { coord: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!coord) return
    map.flyTo(coord, Math.max(map.getZoom(), 15), { animate: true, duration: 0.6 })
  }, [coord?.[0], coord?.[1]]) // eslint-disable-line
  return null
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface HighlightFinalized {
  coord:         [number, number]
  code:          string
  platformColor: string
}

export interface OperationalMapProps {
  store:               Store | null
  orders:              Order[]
  markerStates:        Map<string, OrderMarkerState>
  routeCoords:         [number, number][]
  onOrderCtrlClick?:   (orderId: string) => void
  driverHighlightMarkers?: HighlightFinalized[]
  highlightFinalized?: HighlightFinalized | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperationalMap({
  store,
  orders,
  markerStates,
  routeCoords,
  onOrderCtrlClick,
  driverHighlightMarkers = [],
  highlightFinalized,
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
            borderColor: '#666677',
            fillColor: '#555566',
            opacity: 1,
            label: '',
            dashed: false,
          }
          return (
            <Marker
              key={order.id}
              position={[order.latitude!, order.longitude!]}
              icon={orderIcon(
                order.platform_order_code ?? '#???',
                state.borderColor,
                state.fillColor,
                state.label,
                state.opacity,
                state.dashed ?? false,
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

      {highlightFinalized && (
        <Marker
          position={highlightFinalized.coord}
          icon={orderIcon(highlightFinalized.code, highlightFinalized.platformColor, highlightFinalized.platformColor, '', 1)}
          zIndexOffset={900}
        />
      )}

      {driverHighlightMarkers.map((entry) => (
        <Marker
          key={`driver-highlight-${entry.code}-${entry.coord[0]}-${entry.coord[1]}`}
          position={entry.coord}
          icon={orderIcon(entry.code, entry.platformColor, '#22d3ee', '', 1)}
          zIndexOffset={650}
        />
      ))}

      <FitBoundsOnce positions={allPositions} />
      <PanTo coord={highlightFinalized?.coord ?? null} />
    </MapContainer>
  )
}
