import type { Page } from '@playwright/test'

// The one credential pair the mocked Supabase sign-in (see mockAuth) accepts.
export const DEMO = { email: 'demo@silhoufit.com', password: 'Demo@1234' }

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`

/** The signed-in user Supabase returns. By default they have already seen the onboarding tour; `brandNew` has not. */
const authUser = (brandNew: boolean) => ({
  id: 'user-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: DEMO.email,
  user_metadata: brandNew ? {} : { onboarding: { status: 'completed', at: '2026-01-15T08:30:00.000Z' } },
})

/**
 * Stands in for Supabase Auth and GET /users/me: only DEMO signs in, any other pair is invalid_credentials.
 * `brandNew` signs in a user who has not seen the onboarding tour yet; the tour's save (PUT /auth/v1/user) is answered too.
 */
export async function mockAuth(page: Page, { brandNew = false }: { brandNew?: boolean } = {}) {
  await page.route('**/auth/v1/user*', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ json: authUser(brandNew), headers: CORS })
  })
  await page.route('**/auth/v1/token*', async (route) => {
    const { email, password } = route.request().postDataJSON() ?? {}
    if (email === DEMO.email && password === DEMO.password) {
      await route.fulfill({
        json: { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh', user: authUser(brandNew) },
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
  // No saved addresses by default; a test that needs some registers mockAddresses, which wins as the later route.
  await page.route('**/users/me/addresses', (route) => route.fulfill({ json: [], headers: CORS }))
  await page.route('**/users/me', (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: DEMO.email,
        role: 'customer',
        firstName: 'Demo',
        middleName: null,
        lastName: 'Shopper',
        suffix: null,
        fullName: 'Demo Shopper',
        avatarUrl: null,
        createdAt: '2026-01-15T08:30:00.000Z',
        updatedAt: '2026-01-15T08:30:00.000Z',
      },
      headers: CORS,
    }),
  )
}

/**
 * Stands in for Supabase Auth sign-up with email confirmation on: it answers with an obfuscated user
 * (no session, empty identities) for DEMO.email, and a new unconfirmed user for any other address.
 * Every request body is pushed to `bodies` so a test can assert what was sent.
 */
export async function mockSignUp(page: Page, bodies: object[] = []) {
  await page.route('**/auth/v1/signup*', async (route) => {
    const body = route.request().postDataJSON() ?? {}
    bodies.push(body)
    const identities = body.email === DEMO.email ? [] : [{ identity_id: 'identity-1' }]
    await route.fulfill({
      json: { id: 'user-2', aud: 'authenticated', role: '', email: body.email, identities },
      headers: CORS,
    })
  })
}

/**
 * Stands in for the Google round trip. The Supabase `/auth/v1/authorize` request is answered with a redirect back to
 * its own `redirect_to` (what Google and Supabase do), carrying `?code=` or, when `cancelled`, `?error=access_denied`.
 * `grant_type=pkce` on `/auth/v1/token` then returns a session for DEMO. Register it after mockAuth, which serves /users/me.
 * Every authorize URL is pushed to `authorizeUrls` so a test can assert the provider and redirect_to.
 */
export async function mockGoogle(
  page: Page,
  { cancelled = false, brandNew = false }: { cancelled?: boolean; brandNew?: boolean } = {},
  authorizeUrls: URL[] = [],
) {
  await page.route('**/auth/v1/authorize*', async (route) => {
    const url = new URL(route.request().url())
    authorizeUrls.push(url)
    const back = new URL(url.searchParams.get('redirect_to') ?? '')
    if (cancelled) {
      back.searchParams.set('error', 'access_denied')
      back.searchParams.set('error_code', 'access_denied')
      back.searchParams.set('error_description', 'The user denied access')
    } else {
      back.searchParams.set('code', 'google-test-code')
    }
    await route.fulfill({ status: 302, headers: { location: back.toString() } })
  })
  await page.route('**/auth/v1/token*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('grant_type') !== 'pkce') {
      await route.fallback()
      return
    }
    await route.fulfill({
      json: { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh', user: authUser(brandNew) },
      headers: CORS,
    })
  })
}

/** Starts the page already signed in, by seeding the session store before any script runs. */
export async function signedIn(page: Page) {
  await page.addInitScript(
    (user) => localStorage.setItem('silhoufit-session', JSON.stringify(user)),
    { name: 'Demo Shopper', email: DEMO.email },
  )
}
