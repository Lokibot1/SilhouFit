import { emailFor } from '../service/credentials'
import type { AdminAccount, Customer, StaffAccount } from '../types/accounts'

// Customer names come from the dashboard's order generator, so each one has orders to show.
const CUSTOMER_NAMES: [string, string][] = [
  ['Maria', 'Santos'], ['Jose', 'Reyes'], ['Angelica', 'Cruz'], ['Juan', 'Bautista'], ['Katrina', 'Ocampo'],
  ['Mark', 'Garcia'], ['Bea', 'Mendoza'], ['Paolo', 'Torres'], ['Jasmine', 'Dela Cruz'], ['Carlo', 'Villanueva'],
  ['Trisha', 'Aquino'], ['Miguel', 'Ramos'], ['Camille', 'Castillo'], ['Gabriel', 'Navarro'], ['Nicole', 'Pascual'],
  ['Rafael', 'Domingo'], ['Andrea', 'Soriano'], ['Joshua', 'Manalo'], ['Patricia', 'Hernandez'], ['Christian', 'Lim'],
  ['Denise', 'Santos'], ['Lorenzo', 'Reyes'], ['Isabel', 'Cruz'], ['Kevin', 'Garcia'], ['Maria', 'Torres'],
]

export const ADDRESSES = [
  '12 Mabini St., Quezon City, Metro Manila',
  '45 Rizal Ave., Cebu City, Cebu',
  '8 Aguinaldo Hwy., Imus, Cavite',
  '101 Magsaysay Blvd., Davao City, Davao del Sur',
]

const day = (n: number) => new Date(Date.UTC(2025, 6, 1 + n * 9, 2, 30)).toISOString()

export const MOCK_CUSTOMERS: Customer[] = CUSTOMER_NAMES.map(([firstName, lastName], n) => ({
  id: `cus-${String(n + 1).padStart(3, '0')}`,
  role: 'customer',
  firstName,
  lastName,
  email: `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + `${n + 1}@example.com`,
  phone: `+63917${String(1000000 + n * 7919).slice(0, 7)}`,
  status: n % 9 === 8 ? 'inactive' : 'active',
  createdAt: day(n),
  lastSignInAt: n % 9 === 8 ? null : day(n + 30),
  orderCount: 0,
  lifetimeSpend: 0,
  address: n % 5 === 4 ? undefined : ADDRESSES[n % ADDRESSES.length],
  bodyProfileSet: n % 3 !== 0,
}))

type StaffSeed = [firstName: string, lastName: string, status: StaffAccount['status'], mustChangePassword: boolean]
const STAFF: StaffSeed[] = [
  ['Sam', 'Reyes', 'active', false],
  ['Liza', 'Fernandez', 'active', false],
  ['Ramon', 'Dizon', 'active', false],
  ['Grace', 'Tan', 'active', true],
  ['Noel', 'Alvarez', 'inactive', false],
  ['Kristine', 'Lopez', 'active', false],
  ['Erwin', 'Salazar', 'archived', false],
  ['Hannah', 'Uy', 'archived', false],
]

export const MOCK_STAFF: StaffAccount[] = STAFF.map(([firstName, lastName, status, mustChangePassword], n) => {
  const username = `${firstName}.${lastName}`.toLowerCase()
  return {
    id: `stf-${String(n + 1).padStart(3, '0')}`,
    role: 'staff',
    firstName,
    lastName,
    username,
    email: emailFor(username),
    phone: `+63928${String(2000000 + n * 6007).slice(0, 7)}`,
    status,
    createdAt: day(n + 2),
    lastSignInAt: mustChangePassword ? null : day(n + 40),
    mustChangePassword,
    ...(status === 'archived' && { archivedAt: day(n + 60) }),
  }
})

/** The first admin is the development login (see MOCK_PASSWORDS). */
export const MOCK_ADMINS: AdminAccount[] = [
  ['Dev', 'Admin', 'admin'],
  ['Brian', 'Dijamco', 'brian.dijamco'],
  ['Alyssa', 'Ferrer', 'alyssa.ferrer'],
].map(([firstName, lastName, username], n) => ({
  id: `adm-${String(n + 1).padStart(3, '0')}`,
  role: 'admin' as const,
  firstName,
  lastName,
  username,
  email: emailFor(username),
  phone: `+63939${String(3000000 + n * 4231).slice(0, 7)}`,
  status: 'active' as const,
  createdAt: day(n),
  lastSignInAt: day(n + 80),
  mustChangePassword: false,
}))

/** Plain text on purpose: this is a demo store with no backend. Never reuse a real password here. */
export const DEV_ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }

export const MOCK_PASSWORDS: Record<string, string> = {
  ...Object.fromEntries(MOCK_STAFF.map((account) => [account.id, 'Staff@12345'])),
  ...Object.fromEntries(MOCK_ADMINS.map((account) => [account.id, 'Admin@12345'])),
}
