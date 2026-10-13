import type { Page } from '@playwright/test'

// The one credential pair the mocked Supabase sign-in (see mockAuth) accepts.
export const DEMO = { email: 'demo@silhoufit.com', password: 'Demo@1234' }

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`

/** Stands in for Supabase Auth and GET /users/me: only DEMO signs in, any other pair is invalid_credentials. */
export async function mockAuth(page: Page) {
  await page.route('**/auth/v1/token*', async (route) => {
    const { email, password } = route.request().postDataJSON() ?? {}
    if (email === DEMO.email && password === DEMO.password) {
      const user = { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: DEMO.email }
      await route.fulfill({
        json: { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh', user },
        headers: CORS,
      })
      return
    }
    await route.fulfill({
      status: 400,
      json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
      headers: CORS,
    })
  })
  await page.route('**/users/me', (route) =>
    route.fulfill({
      json: { id: 'user-1', email: DEMO.email, firstName: 'Demo', lastName: 'Shopper', fullName: 'Demo Shopper' },
      headers: CORS,
    }),
  )
}

/** Starts the page already signed in, by seeding the session store before any script runs. */
export async function signedIn(page: Page) {
  await page.addInitScript(
    (user) => localStorage.setItem('silhoufit-session', JSON.stringify(user)),
    { name: 'Demo Shopper', email: DEMO.email },
  )
}
