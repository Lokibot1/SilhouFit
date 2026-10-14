// The device's position, asked for only after the user taps Auto-pin.
export type LocationErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export class LocationError extends Error {
  readonly kind: LocationErrorKind
  constructor(kind: LocationErrorKind) {
    super(`Location failed: ${kind}`)
    this.kind = kind
  }
}

export interface Position {
  lat: number
  lon: number
  /** Metres of uncertainty the device reports. */
  accuracy: number
}

/** Why Auto-pin cannot work here, or null when it can. */
export function locationUnsupportedReason(): string | null {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return "This browser can't share your location."
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Your location is only available on a secure (https) connection.'
  }
  return null
}

export function getCurrentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (locationUnsupportedReason()) return reject(new LocationError('unsupported'))
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
      (error) => reject(new LocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}
