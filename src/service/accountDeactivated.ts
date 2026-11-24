// The API answers 403 "User account is deactivated" to a signed-in person whose account an administrator turned off, even while their token is still valid.
// The services only report it here; App registers what happens (sign out and say why), which keeps the services free of the sign-out imports.
let handler: (() => void) | null = null

export const onAccountDeactivated = (next: () => void) => {
  handler = next
}

export const isDeactivatedAnswer = (status: number, detail?: string) => status === 403 && /deactivated/i.test(detail ?? '')

export const reportAccountDeactivated = () => handler?.()
