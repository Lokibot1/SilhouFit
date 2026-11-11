import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import { getCurrentPosition, LocationError, locationUnsupportedReason, type LocationErrorKind } from '../../service/geolocation'
import { AlertIcon, SpinnerIcon } from '../form/icons'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Tooltip } from '../ui/Tooltip'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
// The whole country until the user zooms in; Auto-pin and a placed pin go to street level.
const PHILIPPINES = { lat: 12.8797, lon: 121.774, zoom: 6 }
const STREET_ZOOM = 17
const WIDE_ACCURACY_M = 500

// The default marker images are looked up by URL and break once a bundler renames them, so the pin is CSS. The
// marker is a 44px touch target with the 28px pin drawn in its middle; its tip sits at the anchor.
const PIN_HTML =
  '<span class="flex size-11 items-center justify-center"><span class="block size-7 -rotate-45 rounded-[50%_50%_50%_0] border-2 border-canvas bg-fg shadow-md"></span></span>'

const PIN_LABEL = 'Pinned location. Drag to adjust, or use Pin map center.'

const LOCATION_ERRORS: Record<Exclude<LocationErrorKind, 'unsupported'>, string> = {
  denied:
    'Location access is blocked for this site, so we cannot find you. Allow location in your browser settings and try again, or tap the map to drop the pin yourself.',
  unavailable:
    "Your device couldn't work out where you are right now, probably because the signal is weak. Move somewhere with a better signal and try again, or tap the map to drop the pin yourself.",
  timeout:
    'Finding your location took longer than 10 seconds. Try again, or tap the map to drop the pin yourself.',
}

interface MapPickerProps {
  /** Back to the form without using the pin. */
  onBack: () => void
  /**
   * The pin is confirmed (or Auto-pin found the device and there is no usable map to adjust it on). Resolves to why the
   * pin was refused, or null once it was taken and the map is closing.
   */
  onUse: (lat: number, lon: number) => Promise<string | null>
  /** 'kral' restyles the chrome around the map flat and square for the KRAL pages. */
  tone?: 'kral'
}

/** A Leaflet map the user taps, drags or Auto-pins. Nothing of Leaflet loads until this is on screen. */
export default function MapPicker({ onBack, onUse, tone }: MapPickerProps) {
  const kral = tone === 'kral'
  const primary = kral ? KRAL_PRIMARY : PRIMARY_BUTTON
  const secondary = kral ? KRAL_SECONDARY : SECONDARY_BUTTON
  const muted = kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'
  const reduced = useReducedMotion() ?? false
  const hostRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const placeRef = useRef<(lat: number, lon: number, zoom?: boolean) => void>(() => {})
  const alive = useRef(true)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tilesFailed, setTilesFailed] = useState(false)
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [using, setUsing] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<Exclude<LocationErrorKind, 'unsupported'> | null>(null)
  const unsupported = locationUnsupportedReason()

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    alive.current = true
    // Per run, not the shared `alive` ref: a development double mount must not build the map twice.
    let cancelled = false
    let map: LeafletMap | null = null
    let observer: ResizeObserver | undefined

    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([module]) => {
        const host = hostRef.current
        if (cancelled || !host) return
        // The ES build has named exports only; a CommonJS build puts them on `default`.
        const ns = module as typeof import('leaflet') & { default?: typeof import('leaflet') }
        const L = ns.default ?? ns
        map = L.map(host, {
          center: [PHILIPPINES.lat, PHILIPPINES.lon],
          zoom: PHILIPPINES.zoom,
          minZoom: 5,
          zoomAnimation: !reduced,
          fadeAnimation: !reduced,
          markerZoomAnimation: !reduced,
          inertia: !reduced,
        })
        const tiles = L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
        tiles.on('tileerror', () => {
          if (alive.current) setTilesFailed(true)
        })
        tiles.on('tileload', () => {
          if (alive.current) setTilesFailed(false)
        })

        const icon = L.divIcon({ className: '', html: PIN_HTML, iconSize: [44, 44], iconAnchor: [22, 42] })
        const place = (lat: number, lon: number, zoom = false) => {
          if (!map) return
          if (markerRef.current) markerRef.current.setLatLng([lat, lon])
          else {
            const marker = L.marker([lat, lon], { icon, draggable: true, keyboard: true }).addTo(map)
            // `alt` is ignored for a divIcon, so the focusable marker is named here.
            marker.getElement()?.setAttribute('aria-label', PIN_LABEL)
            marker.on('dragend', () => {
              const at = marker.getLatLng()
              setAccuracy(null)
              setRefused(null)
              setPin({ lat: at.lat, lon: at.lng })
            })
            markerRef.current = marker
          }
          setRefused(null)
          setPin({ lat, lon })
          if (zoom) map.setView([lat, lon], STREET_ZOOM, { animate: !reduced })
        }
        placeRef.current = place
        map.on('click', (event) => {
          setAccuracy(null)
          place(event.latlng.lat, event.latlng.lng)
        })
        map.getContainer().setAttribute('aria-label', 'Map. Tap to drop a pin, or use the arrow keys to move the map.')
        mapRef.current = map
        setMapState('ready')

        // The dialog is still animating in when the map is made, so its size is read again as it settles.
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
          observer.observe(host)
        }
      })
      .catch(() => {
        if (!cancelled) setMapState('failed')
      })

    return () => {
      cancelled = true
      alive.current = false
      observer?.disconnect()
      map?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // The map is built once; motion preference is read at that moment.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function autoPin() {
    setLocating(true)
    setLocationError(null)
    try {
      const position = await getCurrentPosition()
      if (!alive.current) return
      setAccuracy(position.accuracy)
      // Without a usable map there is nothing to adjust the pin on, so the position is used as it is.
      if (!mapRef.current || tilesFailed) void confirmPin(position.lat, position.lon)
      else placeRef.current(position.lat, position.lon, true)
    } catch (error) {
      if (!alive.current) return
      const kind = error instanceof LocationError && error.kind !== 'unsupported' ? error.kind : 'unavailable'
      setLocationError(kind)
    } finally {
      if (alive.current) setLocating(false)
    }
  }

  async function confirmPin(lat: number, lon: number) {
    setUsing(true)
    setRefused(null)
    const reason = await onUse(lat, lon)
    if (!alive.current) return
    setUsing(false)
    setRefused(reason)
  }

  function pinCenter() {
    const center = mapRef.current?.getCenter()
    if (!center) return
    setAccuracy(null)
    placeRef.current(center.lat, center.lng)
  }

  const noMap = mapState === 'failed' || tilesFailed

  const autoPinButton = (
    <button
      type="button"
      onClick={() => void autoPin()}
      disabled={locating || unsupported !== null}
      className={`${secondary} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {locating ? (
        <>
          <SpinnerIcon />
          Finding you…
        </>
      ) : (
        'Auto-pin location'
      )}
    </button>
  )
  const useButton = (
    <button
      type="button"
      disabled={!pin || using}
      onClick={() => pin && void confirmPin(pin.lat, pin.lon)}
      className={`${primary} w-full disabled:cursor-not-allowed sm:w-auto`}
    >
      {using && <SpinnerIcon />}
      Use this location
    </button>
  )

  return (
    <div className="pb-5">
      <h3 ref={headingRef} tabIndex={-1} className={`text-lg outline-none ${kral ? 'font-kral-display font-extrabold text-kral-fg uppercase' : 'display text-fg'}`}>
        Pin your location
      </h3>
      <p className={`mt-1 text-base leading-relaxed ${muted}`}>
        Tap the map to drop a pin and drag it to adjust. Or let your device find you with Auto-pin.
      </p>

      <div className={`relative isolate mt-3 h-72 shortest:h-48 overflow-hidden border ${kral ? 'border-kral-fg bg-kral-porcelain dark:bg-kral-graphite' : 'rounded-xl border-line bg-canvas-sub'}`}>
        <div ref={hostRef} className="address-map absolute inset-0" />
        {mapState === 'loading' && (
          <div role="status" className={`absolute inset-0 z-[1000] flex animate-pulse items-center justify-center gap-2 text-base ${kral ? 'bg-kral-porcelain font-kral-mono text-kral-muted dark:bg-kral-graphite' : 'bg-line text-fg-muted'}`}>
            <SpinnerIcon />
            Loading the map…
          </div>
        )}
      </div>

      {noMap && (
        <p role="status" className={`mt-3 flex items-start gap-2 text-base leading-snug ${muted}`}>
          <AlertIcon className="mt-1 shrink-0 text-danger" />
          <span>
            {mapState === 'failed'
              ? "The map couldn't load, so there is nothing to tap. Check your connection, then go back and try again. You can still use Auto-pin or fill in the form."
              : "The map pictures didn't load, so the map looks blank. Check your connection. You can still use Auto-pin or fill in the form."}
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        {unsupported ? (
          <Tooltip label={unsupported} describe>
            {autoPinButton}
          </Tooltip>
        ) : (
          autoPinButton
        )}
        {mapState === 'ready' && !tilesFailed && (
          <button type="button" onClick={pinCenter} className={secondary}>
            Pin map center
          </button>
        )}
      </div>
      {unsupported && <p className={`mt-2 text-base leading-snug ${muted}`}>{unsupported}</p>}
      <p className={`mt-2 leading-snug ${kral ? 'font-kral-mono text-base text-kral-muted md:text-sm' : 'text-sm text-fg-muted'}`}>
        Your location is sent to OpenStreetMap only to fill these fields. We don&apos;t save it.
      </p>

      {locationError && (
        <div role="alert" className={`mt-3 flex items-start gap-2 text-base leading-snug text-danger ${kral ? 'font-kral-mono' : ''}`}>
          <AlertIcon className="mt-1 shrink-0" />
          <div>
            <p>{LOCATION_ERRORS[locationError]}</p>
            {locationError === 'timeout' && (
              <button type="button" onClick={() => void autoPin()} className={`${secondary} mt-2`}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {refused && (
        <div role="alert" className={`mt-3 flex items-start gap-2 text-base leading-snug text-danger ${kral ? 'font-kral-mono' : ''}`}>
          <AlertIcon className="mt-1 shrink-0" />
          <p>{refused}</p>
        </div>
      )}

      {accuracy !== null && (
        <p role="status" className={`mt-3 text-base leading-snug ${muted}`}>
          <span className="tabular-nums">Accurate to about {Math.round(accuracy)} m.</span>
          {accuracy > WIDE_ACCURACY_M && (
            <span className={kral ? 'text-kral-fg' : 'text-fg'}> That is a wide area, so drag the pin onto your exact spot before you use it.</span>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} className={secondary}>
          Back to form
        </button>
        {pin ? (
          useButton
        ) : (
          <Tooltip label="Tap the map or use Auto-pin to drop a pin first.">{useButton}</Tooltip>
        )}
      </div>
    </div>
  )
}
