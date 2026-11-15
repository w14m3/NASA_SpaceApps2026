# Resource integration log (contract §4)

Decision per resource: **INTEGRATE / VALIDATE-AGAINST / REFERENCE / REJECT**. "Read" means fetched and read in a
session; this build session (2026-11-15) could not reach any NASA/JPL/USGS/CSA/ASU host (network policy, preflight in
`docs/WORKLOG.md`), so findings below come from (a) the reference/v1 session of 2026-11-14, which did read several of
them and recorded its findings in `reference/v1/docs/RESOURCES.md` and `reference/v1/data/sites_research.json`, and
(b) artifacts already in the repository. Anything not read by anyone is marked **not read**. The challenge Resources
tab could not be re-checked (§6.15 item 7); `docs/challenge/challenge_page.md` (copied 2026-11-14) is the text used.

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
