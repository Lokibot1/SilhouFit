// The API answers 403 "User account is deactivated" to a signed-in person whose account an administrator turned off, even while their token is still valid.
// The services only report it here; App registers what happens (sign out and say why), which keeps the services free of the sign-out imports.
let handler: (() => void) | null = null

export const onAccountDeactivated = (next: () => void) => {
  handler = next
}

export const isDeactivatedAnswer = (status: number, detail?: string) => status === 403 && /deactivated/i.test(detail ?? '')

export const reportAccountDeactivated = () => handler?.()

/** For a service that reads its own responses: a 403 answer that says the account is deactivated is reported. The body is read from a clone, so the caller can still read it. */
export async function reportIfDeactivated(response: Response) {
  if (response.status !== 403) return
  const detail = await response
    .clone()
    .json()
    .then((body: { message?: unknown }) => String(body?.message ?? ''), () => '')
  if (isDeactivatedAnswer(403, detail)) reportAccountDeactivated()
}
