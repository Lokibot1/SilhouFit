import { getSupabase } from './supabase'

/** Lets the People API read the birthday of the Google account that signed in. A sensitive scope: Google's consent-screen review applies. */
export const BIRTHDAY_SCOPE = 'https://www.googleapis.com/auth/user.birthday.read'

/** The signed-in Google account's birthday as "YYYY-MM-DD", or null when Google has none, hides the year, or cannot be reached. */
export async function fetchGoogleBirthday(): Promise<string | null> {
  try {
    const supabase = await getSupabase()
    const token = (await supabase.auth.getSession()).data.session?.provider_token
    if (!token) return null
    const response = await fetch('https://people.googleapis.com/v1/people/me?personFields=birthdays', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const { birthdays } = (await response.json()) as {
      birthdays?: { date?: { year?: number; month?: number; day?: number } }[]
    }
    for (const { date } of birthdays ?? []) {
      if (date?.year && date.month && date.day) {
        return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
      }
    }
    return null
  } catch {
    return null
  }
}
