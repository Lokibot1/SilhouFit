import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'

const AUTH_CALLBACK_URL = 'com.silhoufit.app://auth/callback'

export function handleAppUrl(url: string) {
  if (!url.startsWith(AUTH_CALLBACK_URL)) return
  void Browser.close()
  const { search, hash } = new URL(url)
  window.location.replace(`/auth/callback${search}${hash}`)
}

void App.addListener('appUrlOpen', ({ url }) => handleAppUrl(url))

// Style.Dark is light text, for a dark app background.
export function syncStatusBar(theme: 'light' | 'dark') {
  void StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })
}
