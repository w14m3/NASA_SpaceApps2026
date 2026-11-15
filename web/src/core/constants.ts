// Physical constants (contract §7.2). Each value is cited in docs/METHODS.md §2.
export const R_MOON_KM = 1737.4 // LOLA reference sphere (product metadata)
export const R_MOON_M = 1_737_400
export const R_SUN_KM = 695_700 // IAU 2015 Resolution B3
export const R_EARTH_KM = 6378.1366 // IERS Conventions 2010 (equatorial; flattening ignored for the disk)
export const AU_KM = 149_597_870.7 // IAU 2012 Resolution B2
export const S0_W_M2 = 1360.8 // Kopp & Lean 2011, total solar irradiance at 1 au
export const C_KM_S = 299_792.458 // SI definition
export const SYNODIC_DAYS = 29.530589 // mean synodic month
export const G_MOON = 1.62 // m/s², NASA Moon fact sheet
export const SIGMA_SB = 5.670374419e-8 // W m⁻² K⁻⁴, SI defined constant (2019 redefinition)
export const EARTH_A_KM = 6378.137 // spheroid of the DSN geodetic coordinates (NAIF earth_topo_260814.tf)
export const EARTH_B_KM = 6356.7523142478
export const HOUR = 3_600_000
export const DAY = 86_400_000
export const SYNODIC_MS = SYNODIC_DAYS * DAY
export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI
