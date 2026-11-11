// Phones (portrait and landscape), tablets, laptops and ultrawide, for the auth-page layout specs.
export const DEVICE_MATRIX = [
  { name: 'Galaxy Fold', width: 280, height: 653 },
  { name: 'iPhone SE (1st gen)', width: 320, height: 568 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'phone landscape', width: 667, height: 375 },
  { name: 'large phone landscape', width: 844, height: 390 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'ultrawide', width: 2560, height: 1440 },
] as const

// The sizes the customer-facing screens must hold at (tests/responsive): foldable, small and large phones in both
// orientations, tablets, laptop and desktop.
export const RESPONSIVE_MATRIX = [
  { width: 280, height: 653 },
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 600, height: 960 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 834, height: 1194 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const
