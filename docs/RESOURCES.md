# Resource integration log (contract §4)

Decision per resource: **INTEGRATE / VALIDATE-AGAINST / REFERENCE / REJECT**. "Read" means fetched and read in a
session. Until 11:00 on 2026-11-15 no NASA/JPL/USGS/CSA/ASU host was reachable from the build environment; from 11:12
(network opened by the owner) the hosts below were read directly through the session proxy — see **Update 11:12** at
the end, which supersedes the earlier rows where they differ. The challenge Resources tab could still not be
re-checked: www.spaceappschallenge.org fails TLS verification (incomplete certificate chain; not bypassed).

| Resource | Decision | Evidence and use |
|---|---|---|
| JPL Horizons API (ssd-api.jpl.nasa.gov) | **VALIDATE-AGAINST** | Read by v1: lunar-surface observer `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD`; MEAN_ME frame, 1737.4 km sphere (confirmed in response headers). Here: the 2013 cached responses are re-run offline (V2, V3). Not called at runtime. |
| NAIF SPICE generic kernels | **INTEGRATE** (via v1 artifact) | v1 built the DE440 MOON_ME Chebyshev ephemeris with `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `de440s.bsp` (hashes in its manifest). Used unchanged for 2026–2031 and as the oracle (O1, V19). |
| JPL DE421 via PyPI `de421` 2008.1 | **INTEGRATE** | Fetched 2026-11-15 (sha256 `a66faf7b…`); layout verified against jplephem 1.2; rebuilds 2017–2026 (D3), agrees with SPICE DE440 to 1.6e-5° (V19). |
| LOLA south-pole DEMs, PGDA product 90 | **INTEGRATE** (240 m, via v1) | v1 read the product page and file CRS (south polar stereographic, 1737.4 km, MOON_ME DE421). The 240 m 80–90°S grid and the 80 m-based masks are reused; 80 m, 20 m and `_ERR` rasters could not be fetched here (O2 blocked, D7). |
| LOLA 5 m site DEMs (product 78), 5 m mosaic (81), SfS (104) | **REFERENCE (not read)** | Unreachable. Would give confidence grade A and lander-scale hazards; not used. |
| NASA Moon Trek tiles | **INTEGRATE** | WMTS template verified by v1 from the capabilities XML of `Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02` (default028mm, zoom 0–8, CORS `*`). The globe streams zoom-2 tiles at runtime, three at a time (throttled). Missing tile = grey ("no coverage"). |
| LROC QuickMap | **REFERENCE** | Not scraped. No documented deep-link scheme could be verified, so "Open in QuickMap" opens the home page and the UI shows the coordinates to paste. V12 not done. |
| Canadian Space Agency — Moon exploration | **REFERENCE (not read)** | Unreachable in both sessions; no CSA content is reproduced. Credited in text as a challenge resource. |
| LROC featured images | **INTEGRATE** (citations) | v1 read the pages for IM-1, IM-2, Chandrayaan-3, SLIM, Blue Ghost M1 and Chang'e 3–6 touchdown coordinates; quotes per site in `sites_research.json`. Used for the curated list and mission replay. |
| NSSDCA lunar landing sites | **INTEGRATE** (citations) | v1 read the Apollo LM coordinates table (LRO-derived) and Luna 9. |
| Boazman et al. 2022 (PSJ 3, 275) | **INTEGRATE** (citations) | Sites 001 (Connecting Ridge) and 004 (Shackleton rim): "verified". |
| Bussey et al. 2010 via Wikipedia; Gracy & Lee LPSC 2024 | **REFERENCE, flagged** | Eight points shown with "coordinate unverified"; three hero regions are centred on them and say so. |
| Mazarico et al. 2011 | **REJECT (unreachable)** | Paywalled for v1; not used. |
| NASA SVS 5013 (Artemis III regions) | **REFERENCE** | Names regions without coordinates (v1); no region outlines shown. |
| DSN station coordinates (NAIF `earth_topo_260814.tf`, DSN 810-005 301 Rev. P) | **INTEGRATE** | DSS-14, DSS-63, DSS-43 geodetic coordinates quoted by v1. |
| IERS finals2000A via PyPI `astropy-iers-data` | **INTEGRATE** | UT1−UTC for the station geometry. |
| astropy 8 / ERFA | **VALIDATE-AGAINST** | Independent station-geometry cross-check V11b (substitute for Horizons). |
| USGS Gazetteer of Planetary Nomenclature | **REFERENCE (not read)** | Unreachable; search covers curated sites, hero regions and coordinates, not IAU feature names. |
| PDS Geosciences, Zenodo | **REFERENCE (not read)** | Unreachable; not needed for the artifacts used. |

## Answers to the contract questions (§4.3)

1. **Moon Trek south-polar layers** — not answered: the catalogue page is rendered by script and trek.nasa.gov was
   unreachable here. The polar map uses the LOLA hillshade from v1 (labelled ×2 vertical exaggeration).
2. **Moon Trek elevation-profile/search services from a static site (CORS)** — not verified. The tile service sends
   `Access-Control-Allow-Origin: *` (v1); other services unknown, so not used.
3. **QuickMap deep-link scheme** — no documented scheme found; the link opens the home page.
4. **Horizons CORS** — not verified; Horizons stays pipeline-only (cached responses).
5. **CSA content for Learn mode** — not read; none used. Learn mode text is our own.
6. **USGS Gazetteer list of south-polar features** — not read; IAU-name search is not implemented.

**Owner action that would unlock more**: allow the Appendix A domains in the cloud environment's network settings;
a later session can then fetch the 80 m / 20 m / 5 m LOLA products, run O2 and V11 against their real oracles, and
add Moon Trek polar tiles and Gazetteer search.

## Update 11:12–12:30, 2026-11-15 (hosts reachable)

| Resource | Decision | What was read and done |
|---|---|---|
| LOLA PGDA product 90 (80 m, 80 m `_ERR`, 240 m 60°S) | **INTEGRATE** | Downloaded with `codex/fetch_nasa_data.py` (SHA-256 in `data/cache/SHA256SUMS`). CRS read from the files: "Moon (2015) – Sphere / Ocentric / South Polar", 80 m grid 7600², 240 m grid 7760². O2 run against the v1 masks (max 0.0010°); candidate grids and live terrain windows now use 80 m (D15–D17). `_ERR` median 0.29 m. |
| NAIF generic kernels | **INTEGRATE (available)** | naif0012, pck00011, moon_pa_de440_200625, moon_de440_250416, de440s, earth_1962_260806_2126_combined, earthstns_itrf93_260814, earth_topo_260814 downloaded. The runtime still uses the v1 SPICE DE440 piece (2026–2031) and DE421 before 2026 (≤ 1.6e-5° apart, V19). |
| JPL Horizons API | **VALIDATE-AGAINST** | V11 run live: Moon az/el from DSS-14/63/43, 240 instants, max 0.0005° (responses cached in `data/raw/horizons_dsn/`). Long TLIST URLs (80 instants) were refused with HTTP 502; 20 per query works. CORS for browser calls not needed (pipeline only). |
| NASA Moon Trek | **INTEGRATE** | Layer catalogue read through `https://trek.nasa.gov/moon/TrekServices/ws/index/polar/searchItems` (URL template from the API page's `config.json`): **71 south-polar layers** (e.g. LOLA 10 m and 30 m shaded relief, LRO WAC mosaic 100 m, LOLA PSR 240 m, LOLA slope 120 m, roughness, LAMP albedo, Mini-SAR, NAC mosaics). WMTSCapabilities read for four of them (tile matrix set `default028mm`, top-left −1,095,930/+1,095,930 m, level-0 8,561.95 m/px; CORS `*`). They are basemaps/overlay on the polar map (D18). |
| LROC QuickMap | **REFERENCE** | Now hosted at https://quickmap.lroc.im-ldi.com (the help page says the asu.edu address "will be retired soon"). The app stores its view in undocumented URL parameters (`prjExtent`, `proj`, `stack`, `defs`), so no deep link is built; the "Open in QuickMap" button opens the new address. V12 (manual screenshot comparison) not done. |
| USGS Gazetteer of Planetary Nomenclature | **INTEGRATE** | Search results for target Moon read (9,206 features, 23 columns incl. centre lat/lon, approval status). 78 approved features south of 79.5°S feed the search box (`pipeline/scripts/build_features.py`, `web/public/data/features.json`). |
| NASA (IM-1, IM-2 pages), ISRO (Chandrayaan-3) | **VALIDATE-AGAINST** | Read for V18 (quotes in `data/validation/V18.json`). The NSSDCA IM-1 catalogue page returned an error page. |
| Canadian Space Agency | **REFERENCE (not read)** | www.asc-csa.gc.ca resets the connection through the proxy; no CSA content used. |
| core2.gsfc.nasa.gov (LOLA 5 m site DEMs) | **REFERENCE (unreachable)** | Gateway 502; grade-A confidence (5 m) therefore still unavailable. |

### Answers to the contract questions (§4.3), updated
1. **Moon Trek south-polar layers**: 71 layers; four integrated as zoomable tiles (LOLA 10 m relief to 33 m/px over
   87.5–90°S, LOLA 30 m relief, WAC mosaic, PSR). The static hillshade stays underneath for offline use.
2. **Trek services from a static site**: tiles and the catalogue service are reachable; tiles send CORS `*`. The
   catalogue is used at build time only.
3. **QuickMap deep link**: no documented scheme (state in undocumented parameters); plain link to the new address.
4. **Horizons CORS**: not needed — Horizons is used by the pipeline (V2, V3, V11).
5. **CSA content**: not reachable (connection reset); none used.
6. **Gazetteer list**: yes — 78 approved south-polar features integrated in search.
