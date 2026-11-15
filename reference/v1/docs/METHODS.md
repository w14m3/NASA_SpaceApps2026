# Methods

Every equation the tool uses, in the order the numbers flow. Code references are to `pipeline/lunarnav/` (Python)
and `web/src/core/` (TypeScript, the same maths in the browser).

## 1. Conventions

| Item | Choice |
|---|---|
| Time | UTC in and out; TDB (ET) inside SPICE via `naif0012.tls` |
| Frame | `MOON_ME` — Mean Earth / Polar Axis, DE440 realisation (`moon_de440_250416.tf`, `moon_pa_de440_200625.bpc`) |
| Longitude, latitude | east-positive, planetocentric |
| Reference sphere | R = 1737.4 km; heights z are relative to it |
| Azimuth, elevation | azimuth clockwise from local north; elevation above the local horizontal of the sphere |
| Instrument height | h above the terrain; always shown |
| Units | km and degrees in the UI, radians internally |

## 2. Ephemeris (`ephem.py`, `cheby.py`, `ephem.ts`)

Sun and Earth positions come from SPICE: `spkpos(target, et, "MOON_ME", "LT+S", "MOON")` — apparent position seen
from the Moon's centre, corrected for light time and stellar aberration, expressed in the body-fixed frame.

For the browser, each Cartesian component is fitted with Chebyshev polynomials of degree 15 on 4-day segments
(interpolation at Chebyshev nodes), 2026-01-01 to 2031-01-03. The independent variable is UTC seconds since the
epoch, so no leap-second table is needed at runtime; the build asserts that TAI−UTC is constant over the span.
The fit error is measured against SPICE at 4,000 random instants per body and stored in `ephem.json`.

## 3. Topocentric geometry (`geom.ts`, `ephem.py`)

Site position **r**ₛ = (R + z₀ + h)·**û**(lat, lon). Local frame: **up** = **û**, **east** = (−sin λ, cos λ, 0),
**north** = **up** × **east**. For a body at **p** (Moon-centred), **d** = **p** − **r**ₛ and

    elevation = asin(d̂ · up),   azimuth = atan2(d̂ · east, d̂ · north)

The Earth direction must use **d**, not **p**: parallax reaches R/d ≈ 0.26°. For the Sun it is negligible, but the
same formula is used. Angular radius = asin(R_body / |d|) with R☉ = 695,700 km and R⊕ = 6378.1366 km
(equatorial; Earth's flattening is ignored).

## 4. Horizon mask (`horizon.py`, `horizon.ts`)

DEM: south polar stereographic on the sphere, true scale at the pole:
k = 2R cos φ / (1 − sin φ), x = k sin λ, y = k cos λ (verified against PROJ to 1e-6 m).

For each azimuth α the algorithm walks the great circle from the site. At arc length s, θ = s/R, the point is
**u**(s) = **up** cos θ + (**north** cos α + **east** sin α) sin θ; its height z(s) is read by bilinear interpolation.
With ρ = R + z(s) and ρ₀ = R + z₀ + h:

    ε(s) = atan2(ρ cos θ − ρ₀, ρ sin θ),      mask(α) = max ε(s) for s ≤ s_max

The curvature of the Moon is included automatically: flat terrain gives the dip −acos(R/ρ₀).

- Azimuth spacing 0.25° (curated sites), 0.5° (custom sites in the browser).
- Step: 1 % of the distance in the near field, never more than half a pixel. (A plain half-pixel step misses
  the kinks of the bilinear surface that set the horizon of a low mast; see V6.)
- Search radius 300 km. Beyond the 80 m product the 240 m 60°S product is used. Rays that leave all data are
  counted and reported.
- **Uncertainty**: lower and upper masks are computed by shifting the terrain by ∓/± δ(s), where
  δ(s) = (σ_terrain + σ_site)·min(1, s / 2 pixels). σ comes from the LOLA `_ERR` raster (80 m product), ±3 m
  outside it (assumption: the measured 240 m-vs-80 m RMS difference, rounded up), and the measured 240 m-vs-80 m RMS difference for the browser DEM.
  The ramp reflects that neighbouring cells share most of their error. Registration error is not included.

## 5. Disk visibility (`visibility.ts`)

The visible fraction of a uniform disk of angular radius ρ centred at (az, el) is integrated in 200 vertical
strips: strip at offset x has half-height √(ρ² − x²); its visible length is
clamp(el + √(ρ² − x²) − mask(az + x / cos el), 0, 2√(ρ² − x²)). No limb darkening.

Thresholds: the Sun counts as visible at ≥ 1 % of its disk, the Earth at ≥ 50 % of its disk.

## 6. Events (`visibility.ts`)

g(t) = visible fraction − threshold. Scan every 10 minutes (30 minutes for windows longer than 120 days), then
bisection to 1 s. Between scan points of equal sign, a sub-scan catches grazing events when g is close to zero
and heading towards it. ± on an event time is the largest shift obtained with the lower and upper masks.

## 7. Illumination and incident energy (`analysis.ts`)

    S(t) = 1360.8 W/m² · (1 au / d☉)²
    P_inc(t) = S · f☉ · max(0, n̂ · ŝ)      per m² of panel
    E = ∫ P_inc dt                          trapezoid on 901 samples across the window

Panel normals: flat → up; vertical tracking → horizontal, always facing the Sun's azimuth (cos = cos el); fixed
vertical → horizontal at azimuth 0/90/180/270°. Panels are one-sided. This is incident energy: multiply by area,
cell efficiency and system losses to get electrical energy. Not modelled: light reflected from terrain,
temperature, dust, the lander's own shadow, shading between panels.

## 8. Scores (`analysis.ts`)

    Power = 100 · (0.6 · L + 0.4 · (1 − min(1, D / 354.4 h)))
    Link  = 100 · (0.6 · E + 0.4 · (1 − min(1, G / 354.4 h)))
    Combined = √(Power · Link)

L = fraction of the window with the Sun visible, D = longest dark stretch, E = fraction with Earth in view,
G = longest stretch without Earth; 354.4 h is half a synodic month. These are ranking aids, not requirements.

## 9. What "Earth in view" means

A geometric line of sight from the instrument to Earth's disk over the terrain. It is not link closure: no
antenna pattern, link budget, ground-station visibility or scheduling is modelled.
