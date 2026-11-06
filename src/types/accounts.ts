/** `inactive` is for accounts that exist but are not in use; only staff can be archived. */
export type AccountStatus = 'active' | 'inactive' | 'archived'

export interface BaseAccount {
  id: string
  firstName: string
  /** Only when the server has one (the invite form takes it). */
  middleName?: string
  lastName: string
  /** Only when the server has one, e.g. Jr. */
  suffix?: string
  email: string
  phone: string
  status: AccountStatus
  /** ISO time. */
  createdAt: string
  /** ISO time, or null when the person has never signed in. */
  lastSignInAt: string | null
}

export interface StaffAccount extends BaseAccount {
  role: 'staff'
  username: string
  mustChangePassword?: boolean
  /** ISO time, set while the account is archived. */
  archivedAt?: string
}

/** Only a superadmin can archive an admin, so an admin is never archived by another admin. */
export interface AdminAccount extends BaseAccount {
  role: 'admin'
  username: string
  mustChangePassword?: boolean
  /** ISO time, set while the account is archived. */
  archivedAt?: string
}

/** Superadmins can create each other but never reset or archive one another, so there is no `archived` status or `archivedAt` for them. */
export interface SuperadminAccount extends Omit<BaseAccount, 'status'> {
  role: 'superadmin'
  status: Exclude<AccountStatus, 'archived'>
  username: string
  mustChangePassword?: boolean
}

/** A customer as the accounts API lists them: the profile only, no orders or spend. */
export interface CustomerAccount extends BaseAccount {
  role: 'customer'
}

export interface Customer extends BaseAccount {
  role: 'customer'
  /** Filled in from the customer's orders when listed. */
  orderCount: number
  lifetimeSpend: number
  address?: string
  /** Whether the customer has saved body measurements for AR Fitting. */
  bodyProfileSet: boolean
}

/** What the admin hands to a new or reset account. Shown once; the password is never listed again. */
export interface Credentials {
  username: string
  email: string
  password: string
  mustChangePassword: true
}

export type AuthResult =
  | { ok: true; account: StaffAccount | AdminAccount | SuperadminAccount }
  | { ok: false; reason: 'invalid' | 'archived' }

export type ActivityKind = 'staff-created' | 'admin-created' | 'superadmin-created' | 'password-reset' | 'archived' | 'restored'

/** One line of the dashboard's activity log. */
export interface ActivityEntry {
  id: string
  /** ISO time. */
  at: string
  kind: ActivityKind
  /** Who did it: the signed-in admin's name. */
  actor: string
  /** Whose account it was done to. */
  target: string
}
