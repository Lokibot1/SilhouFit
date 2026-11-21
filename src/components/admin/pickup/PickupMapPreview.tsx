import { useEffect, useRef, useState } from 'react'
import { MapPinIcon, SpinnerIcon } from '../../form/icons'

// The same tile provider and credit as the address form's map (MapPicker).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ZOOM = 16

/**
 * A read-only Leaflet map centred on the saved pickup spot, with the pin and its label drawn over the middle.
 * Nothing of Leaflet loads until this is on screen. The address and coordinates beside it are its text alternative.
 */
export default function PickupMapPreview({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tilesFailed, setTilesFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let map: import('leaflet').Map | null = null
    let observer: ResizeObserver | undefined

    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([module]) => {
        const host = hostRef.current
        if (cancelled || !host) return
        // The ES build has named exports only; a CommonJS build puts them on `default`.
        const ns = module as typeof import('leaflet') & { default?: typeof import('leaflet') }
        const L = ns.default ?? ns
        map = L.map(host, {
          center: [lat, lon],
          zoom: ZOOM,
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false,
        })
        const tiles = L.tileLayer(TILES, { maxZoom: 19 }).addTo(map)
        tiles.on('tileerror', () => !cancelled && setTilesFailed(true))
        tiles.on('tileload', () => !cancelled && setTilesFailed(false))
        setState('ready')
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
          observer.observe(host)
        }
      })
      .catch(() => !cancelled && setState('failed'))

    return () => {
      cancelled = true
      observer?.disconnect()
      map?.remove()
    }
  }, [lat, lon])

  const noMap = state === 'failed' || tilesFailed

  return (
    <div className="absolute inset-0 isolate overflow-hidden bg-canvas-sub">
      {/* Leaflet owns the host's classes, so the fade-in sits on this wrapper. Its panes use z-index up to 800, so the wrapper is isolated: without it they paint over the pin. */}
      <div className={`absolute inset-0 isolate motion-safe:transition-opacity motion-safe:duration-300 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}>
        <div
          ref={hostRef}
          role="img"
          aria-label="Map preview of the pickup location. Its address and coordinates are listed beside it."
          className="address-map pointer-events-none size-full"
        />
      </div>

      {state === 'loading' && (
        <div role="status" className="absolute inset-0 z-10 flex animate-pulse items-center justify-center gap-2 bg-line text-base text-fg-muted">
          <SpinnerIcon />
          Loading the map…
        </div>
      )}
      {noMap ? (
        <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-canvas-sub p-4 text-center">
          <MapPinIcon size={20} className="text-danger" />
          <p className="text-base font-semibold text-fg">The map couldn't load</p>
          <p className="text-sm text-fg-muted">Check your connection. The pin is at</p>
          <p className="font-mono text-base text-fg tabular-nums">{`${lat.toFixed(6)}, ${lon.toFixed(6)}`}</p>
        </div>
      ) : (
        state === 'ready' && (
          <>
            {/* The pin's tip sits on the map centre, which is the saved coordinates. */}
            <span role="img" aria-label={`Pickup pin at ${lat.toFixed(6)}, ${lon.toFixed(6)}`} className="absolute top-1/2 left-1/2 z-10 block size-7 -translate-x-1/2 -translate-y-[34px] -rotate-45 rounded-[50%_50%_50%_0] border-2 border-canvas bg-danger shadow-md" />
            <span className="absolute top-1/2 left-1/2 z-10 mt-2 max-w-[80%] -translate-x-1/2 truncate rounded-xl border border-line bg-canvas-sub px-3 py-1 text-sm font-semibold text-fg shadow-bar dark:shadow-none">{label}</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-0 bottom-0 z-10 flex min-h-11 items-center px-2 text-xs text-fg"
            >
              <span className="rounded bg-canvas/85 px-1.5">© OpenStreetMap contributors</span>
              <span className="sr-only">, opens in a new tab</span>
            </a>
          </>
        )
      )}
    </div>
  )
}
