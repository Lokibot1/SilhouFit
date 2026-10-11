import type { Page } from '@playwright/test'

// The one credential pair the sign-in stub (src/service/signIn.ts) accepts.
export const DEMO = { email: 'demo@silhoufit.com', password: 'Demo@1234' }

/** Starts the page already signed in, by seeding the session store before any script runs. */
export async function signedIn(page: Page) {
  await page.addInitScript(
    (user) => localStorage.setItem('silhoufit-session', JSON.stringify(user)),
    { name: 'Demo Shopper', email: DEMO.email },
  )
}
