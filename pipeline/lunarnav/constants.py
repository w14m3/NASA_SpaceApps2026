"""Physical constants. Every value is cited in docs/METHODS.md (contract section 7.2)."""
R_MOON_KM = 1737.4            # LOLA reference sphere (product metadata, Barker et al. 2023)
R_SUN_KM = 695_700.0          # IAU 2015 Resolution B3, nominal solar radius
R_EARTH_KM = 6378.1366        # IERS Conventions 2010, equatorial radius (flattening ignored for the disk)
AU_KM = 149_597_870.7         # IAU 2012 Resolution B2
S0_W_M2 = 1360.8              # Kopp & Lean 2011, total solar irradiance at 1 au
C_KM_S = 299_792.458          # SI definition of the speed of light
SYNODIC_DAYS = 29.530589      # mean synodic month (Explanatory Supplement 3rd ed. / NASA lunar fact sheet)
G_MOON = 1.62                 # m/s^2, NASA Moon fact sheet
# WGS-84-like spheroid quoted by the NAIF station kernel comments for the DSN geodetic coordinates
EARTH_A_KM = 6378.137
EARTH_B_KM = 6356.7523142478
