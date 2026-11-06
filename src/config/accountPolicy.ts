/** Where the sign-in domain of staff and admin accounts points; `username@` this is the sign-in email. */
export const ACCOUNT_EMAIL_DOMAIN = 'silhoufit.dev'

/** True while the Permissions page saves to this browser (localStorage) instead of a permissions API. Set to false when the backend has them. User Management reads the accounts API and no longer uses it. */
export const ACCOUNTS_SAMPLE_DATA = true

/** Signs in the saved staff and admin accounts without Supabase. Always on in development; a production build needs VITE_SIM_AUTH=true. */
export const SIMULATED_AUTH = import.meta.env.DEV || import.meta.env.VITE_SIM_AUTH === 'true'

