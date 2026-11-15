// Hero regions for the candidate grid (contract §7.11): 15 × 15 km boxes on the polar stereographic map, centred on
// curated points of interest. The status of the centre coordinate is inherited from the curated site.
export interface HeroRegion {
  id: string
  name: string
  /** curated site whose coordinate defines the centre */
  anchor: string
  lon: number
  lat: number
  sizeKm: number
  spacingM: number
  status: 'verified' | 'unverified'
}

export const HERO_REGIONS: HeroRegion[] = [
  { id: 'connecting-ridge', name: 'Shackleton – Connecting Ridge', anchor: 'poi_site001_connecting_ridge', lon: -137.31, lat: -89.45, sizeKm: 15, spacingM: 250, status: 'verified' },
  { id: 'malapert', name: 'Malapert massif', anchor: 'poi_bussey2010_M1_malapert', lon: 2.7, lat: -86.04, sizeKm: 15, spacingM: 250, status: 'unverified' },
  { id: 'de-gerlache', name: 'de Gerlache rim', anchor: 'poi_bussey2010_C_degerlache_rim', lon: -68.7, lat: -88.71, sizeKm: 15, spacingM: 250, status: 'unverified' },
  { id: 'peak-near-shackleton', name: 'Peak near Shackleton', anchor: 'poi_bussey2010_D_peak_near_shackleton', lon: 124.5, lat: -88.79, sizeKm: 15, spacingM: 250, status: 'unverified' },
]

export const CANDIDATE_HEIGHTS = [2, 10] as const
export const CANDIDATE_NAZ = 360
/** mask quantisation: uint8 counts of 0.1° above a per-candidate offset (int16, 0.1° units) */
export const MASK_STEP_DEG = 0.1
