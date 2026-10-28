// SAMPLE_DATA: stand-in order, transaction and product activity until the backend records it. The actors are the seeded staff and admins.
import type { ActivityAction, ActivityCategory, ActivityLog } from '../types/activityLogs'
import { MOCK_ADMINS, MOCK_STAFF } from './mockAccounts'

const person = (firstName: string) => {
  const account = [...MOCK_STAFF, ...MOCK_ADMINS].find((a) => a.firstName === firstName)!
  return `${account.firstName} ${account.lastName}`
}
const [SAM, LIZA, RAMON, KRISTINE, DEV, BRIAN, ALYSSA] = ['Sam', 'Liza', 'Ramon', 'Kristine', 'Dev', 'Brian', 'Alyssa'].map(person)

export const CATEGORY_OF: Record<ActivityAction, ActivityCategory> = {
  'staff-created': 'account',
  'admin-created': 'account',
  'password-reset': 'account',
  archived: 'account',
  restored: 'account',
  'order-placed': 'order',
  'order-confirmed': 'order',
  'order-shipped': 'order',
  'order-cancelled': 'order',
  'payment-recorded': 'transaction',
  'refund-issued': 'transaction',
  'refund-approved': 'transaction',
  'invoice-viewed': 'transaction',
  'invoice-exported': 'transaction',
  'product-created': 'product',
  'product-edited': 'product',
  'product-archived': 'product',
  'product-restocked': 'product',
  'size-measurements-updated': 'product',
  'ar-model-added': 'product',
}

// [hours ago, action, actor, target, detail]. Fixed, so the entries and their order are the same on every load.
const ROWS: [number, ActivityAction, string, string, string?][] = [
  [2, 'order-placed', 'Patricia Ocampo', 'SF-10231', '2 items, ₱3,580.00'],
  [3, 'payment-recorded', KRISTINE, 'SF-10231', 'GCash, ₱3,580.00'],
  [5, 'order-confirmed', LIZA, 'SF-10230', 'Stock reserved'],
  [7, 'product-restocked', RAMON, 'Washed Black Tee', '+40 units'],
  [9, 'invoice-viewed', SAM, 'SF-10229'],
  [11, 'order-shipped', LIZA, 'SF-10229', 'Handed to the courier'],
  [14, 'refund-issued', KRISTINE, 'SF-10188', 'Wrong size, ₱2,290.00'],
  [19, 'size-measurements-updated', DEV, 'Tops', 'Chest and waist ranges'],
  [24, 'order-placed', 'Miguel Ocampo', 'SF-10230', '4 items, ₱6,160.00'],
  [27, 'product-edited', ALYSSA, 'Heritage Polo', 'Price and description'],
  [30, 'refund-approved', BRIAN, 'SF-10188', 'Approved for ₱2,290.00'],
  [33, 'invoice-exported', SAM, 'SF-10226', 'PDF'],
  [36, 'ar-model-added', DEV, 'Linen Overshirt', 'Size M model'],
  [41, 'order-cancelled', LIZA, 'SF-10221', 'Customer changed their mind'],
  [44, 'payment-recorded', KRISTINE, 'SF-10228', 'Card, ₱3,490.00'],
  [47, 'order-confirmed', RAMON, 'SF-10227'],
  [52, 'product-created', ALYSSA, 'Pleated Midi Skirt', 'Skirts'],
  [55, 'order-placed', 'Jose Navarro', 'SF-10229', '2 items, ₱3,080.00'],
  [58, 'product-archived', BRIAN, 'Canvas Belt', 'Discontinued'],
  [62, 'invoice-viewed', KRISTINE, 'SF-10224'],
  [66, 'refund-issued', SAM, 'SF-10180', 'Defective item, ₱1,890.00'],
  [70, 'product-restocked', LIZA, 'Tapered Chino', '+25 units'],
  [74, 'order-shipped', RAMON, 'SF-10225', 'Handed to the courier'],
  [78, 'payment-recorded', SAM, 'SF-10226', 'Cash, ₱5,470.00'],
  [83, 'size-measurements-updated', ALYSSA, 'Bottoms', 'Waist and hip ranges'],
  [88, 'order-placed', 'Nicole Hernandez', 'SF-10226', '3 items, ₱5,470.00'],
  [92, 'product-edited', DEV, 'Fence-Line Blazer', 'Sizes'],
  [97, 'refund-approved', DEV, 'SF-10180', 'Approved for ₱1,890.00'],
  [101, 'ar-model-added', ALYSSA, 'Ribbed Knit Dress', 'Size S model'],
  [106, 'order-confirmed', KRISTINE, 'SF-10224'],
  [110, 'invoice-exported', LIZA, 'SF-10219', 'PDF'],
  [114, 'order-cancelled', SAM, 'SF-10214', 'Payment not received'],
  [118, 'product-created', BRIAN, 'Bucket Hat', 'Accessories'],
  [122, 'payment-recorded', RAMON, 'SF-10223', 'GCash, ₱3,960.00'],
  [127, 'order-placed', 'Bea Dela Cruz', 'SF-10223', '4 items, ₱3,960.00'],
  [131, 'product-restocked', KRISTINE, 'Coach Jacket', '+18 units'],
  [136, 'invoice-viewed', DEV, 'SF-10218'],
  [140, 'order-shipped', SAM, 'SF-10220', 'Handed to the courier'],
  [141, 'product-edited', KRISTINE, 'Relaxed Denim', 'Price'],
  [145, 'refund-issued', LIZA, 'SF-10175', 'Not as described, ₱790.00'],
  [149, 'product-archived', ALYSSA, 'Wrap Dress', 'Seasonal'],
  [153, 'size-measurements-updated', BRIAN, 'Dresses', 'Bust and waist ranges'],
  [157, 'order-confirmed', RAMON, 'SF-10219'],
  [160, 'payment-recorded', LIZA, 'SF-10219', 'Card, ₱2,270.00'],
  [163, 'order-placed', 'Denise Manalo', 'SF-10224', '3 items, ₱2,270.00'],
  [166, 'ar-model-added', DEV, 'Washed Black Tee', 'Size L model'],
  [168, 'refund-approved', BRIAN, 'SF-10175', 'Approved for ₱790.00'],
]

/** The sample entries, newest first, dated back from `now`. */
export function buildMockActivityLogs(now = Date.now()): ActivityLog[] {
  return ROWS.map(([hoursAgo, action, actor, target, detail], n) => ({
    id: `mock-log-${String(n + 1).padStart(2, '0')}`,
    category: CATEGORY_OF[action],
    action,
    actor,
    target,
    ...(detail && { detail }),
    createdAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  }))
}
