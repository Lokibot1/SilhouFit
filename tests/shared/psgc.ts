import type { Page } from '@playwright/test'
import batangasBarangays from '../fixtures/psgc/batangas-city-barangays.json' with { type: 'json' }
import calabarzonCities from '../fixtures/psgc/calabarzon-cities.json' with { type: 'json' }
import calabarzonProvinces from '../fixtures/psgc/calabarzon-provinces.json' with { type: 'json' }
import manilaBarangays from '../fixtures/psgc/manila-barangays.json' with { type: 'json' }
import ncrCities from '../fixtures/psgc/ncr-cities.json' with { type: 'json' }
import ncrProvinces from '../fixtures/psgc/ncr-provinces.json' with { type: 'json' }
import regions from '../fixtures/psgc/regions.json' with { type: 'json' }

const CORS = { 'access-control-allow-origin': '*' }

/** Answers the PSGC lists the address form reads (NCR and CALABARZON) from the fixtures, or every one with a 500. */
export async function mockPsgc(page: Page, mode: 'ok' | 'error' = 'ok') {
  await page.route('**/psgc.gitlab.io/api/**', (route) => {
    if (mode === 'error') return route.fulfill({ status: 500, body: 'Internal error', headers: CORS })
    const path = new URL(route.request().url()).pathname.replace('/api', '')
    const table: Record<string, unknown> = {
      '/regions/': regions,
      '/regions/130000000/provinces/': ncrProvinces,
      '/regions/130000000/cities-municipalities/': ncrCities,
      '/cities-municipalities/133900000/barangays/': manilaBarangays,
      '/regions/040000000/provinces/': calabarzonProvinces,
      '/regions/040000000/cities-municipalities/': calabarzonCities,
      '/cities-municipalities/041005000/barangays/': batangasBarangays,
    }
    return path in table ? route.fulfill({ json: table[path], headers: CORS }) : route.fulfill({ status: 404, body: 'Not found', headers: CORS })
  })
}
