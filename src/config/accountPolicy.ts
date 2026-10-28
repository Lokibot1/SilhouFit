/** Where the sign-in domain of staff and admin accounts points; `username@` this is the sign-in email. */
export const ACCOUNT_EMAIL_DOMAIN = 'silhoufit.dev'

/** True while User Management lists the browser's own saved accounts (localStorage) instead of the accounts API. Set to false when the backend has them. */
export const ACCOUNTS_SAMPLE_DATA = true

/** Signs in the saved staff and admin accounts without Supabase. Always on in development; a production build needs VITE_SIM_AUTH=true. */
export const SIMULATED_AUTH = import.meta.env.DEV || import.meta.env.VITE_SIM_AUTH === 'true'

export const ALLOW_SKIP_PASSWORD_CHANGE = true // prototype; set false once backend enforces

/** Whether the first-login password screen offers "Skip for now". The backend can switch it off per account with `passwordChangeSkippable: false`. */
export const canSkipPasswordChange = (me: { mustChangePassword?: boolean; passwordChangeSkippable?: boolean }) =>
  ALLOW_SKIP_PASSWORD_CHANGE && me.passwordChangeSkippable !== false

/** sessionStorage flag set when someone skips the first-login password screen; sign-out clears every one. */
export const PASSWORD_GATE_SKIP_PREFIX = 'silhoufit.password-gate.skipped.'
export const passwordGateSkipKey = (id: string) => `${PASSWORD_GATE_SKIP_PREFIX}${id}`

export const GENERATED_PASSWORD_LENGTH = 12
