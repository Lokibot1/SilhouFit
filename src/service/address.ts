// The delivery address. For now it lives on this device, keyed by email so two accounts on one browser keep their
// own. Everything goes through getAddress/saveAddress and both are async, so moving this to the API later changes
// this file only. Coordinates are never stored: the map pin only fills the form.
const KEY_PREFIX = 'silhoufit-address:'

export interface SavedAddress {
  /** PSGC codes; null when the user typed the place instead of picking it. */
  regionCode: string | null
  region: string
  /** The province's name, or '' (NCR and independent cities have none). */
  province: string
  cityCode: string | null
  city: string
  barangayCode: string | null
  barangay: string
  street: string
  postal: string
}

const key = (email: string) => `${KEY_PREFIX}${email.trim().toLowerCase()}`
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const code = (value: unknown) => (typeof value === 'string' && value ? value : null)

export class AddressStorageError extends Error {
  constructor() {
    super('Address storage is unavailable.')
  }
}

/** Null when nothing is saved (or what is saved is unreadable). Rejects when storage cannot be read at all. */
export async function getAddress(email: string): Promise<SavedAddress | null> {
  let raw: string | null
  try {
    raw = localStorage.getItem(key(email))
  } catch {
    throw new AddressStorageError()
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return null
    const address: SavedAddress = {
      regionCode: code(parsed.regionCode),
      region: text(parsed.region),
      province: text(parsed.province),
      cityCode: code(parsed.cityCode),
      city: text(parsed.city),
      barangayCode: code(parsed.barangayCode),
      barangay: text(parsed.barangay),
      street: text(parsed.street),
      postal: text(parsed.postal),
    }
    return address.city && address.street ? address : null
  } catch {
    return null
  }
}

const listeners = new Set<{ email: string; run: (address: SavedAddress) => void }>()

/** Calls `run` whenever this email's address is saved, so a page that already read it can refresh. Returns the unsubscribe. */
export function onAddressSaved(email: string, run: (address: SavedAddress) => void): () => void {
  const listener = { email: key(email), run }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function saveAddress(email: string, address: SavedAddress): Promise<void> {
  try {
    localStorage.setItem(key(email), JSON.stringify(address))
  } catch {
    throw new AddressStorageError()
  }
  listeners.forEach((listener) => listener.email === key(email) && listener.run(address))
}
