const KEYS = { popup: 'silhoufit-notify-popup', sound: 'silhoufit-notify-sound' } as const

export type NotificationPref = keyof typeof KEYS

/** On unless the shopper turned it off on this device. Storage that is blocked counts as on. */
function read(key: NotificationPref) {
  try {
    return localStorage.getItem(KEYS[key]) !== 'off'
  } catch {
    return true
  }
}

export const popupsOn = () => read('popup')
export const soundOn = () => read('sound')

export function setNotificationPref(key: NotificationPref, on: boolean) {
  try {
    localStorage.setItem(KEYS[key], on ? 'on' : 'off')
  } catch {
    // Blocked storage: the choice just does not stick.
  }
}
