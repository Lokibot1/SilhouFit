import { ACCOUNT_EMAIL_DOMAIN } from '../config/accountPolicy'

export const emailFor = (username: string) => `${username}@${ACCOUNT_EMAIL_DOMAIN}`
