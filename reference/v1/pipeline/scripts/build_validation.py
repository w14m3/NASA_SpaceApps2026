"""Assemble web/public/data/validation.json and docs/VALIDATION.md from recorded test output.

Only results that exist on disk (written by pytest / vitest / the smoke test) are reported
as pass or fail; everything else is 'not run'.  Nothing here is hand-typed.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V = ROOT / "data" / "validation"


def load(name: str):
    p = V / f"{name}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def st(ok: bool) -> str:
    return "pass" if ok else "fail"


def main() -> None:
    checks = []

    def add(id_, test, tol, status, result):
        checks.append({"id": id_, "test": test, "tolerance": tol, "status": status, "result": result})

    r = load("V1")
    if r:
        worst = max(r["projection_vs_proj_m"], r["inverse_round_trip_m"], r["cartesian_round_trip_m"])
        add("V1", "Round trip lat/lon ↔ Cartesian ↔ DEM pixel ↔ map coordinate (5,000 points, checked against PROJ)",
            "≤ 1 m and ≤ 0.5 px", st(worst <= 1 and r["pixel_err_px"] <= 0.5),
            f"max {worst:.1e} m, {r['pixel_err_px']:.1e} px")
    else:
        add("V1", "Coordinate round trips", "≤ 1 m and ≤ 0.5 px", "not run", "—")

    r = load("V2")
    if r:
        s, e = r["stats"]["SUN"], r["stats"]["EARTH"]
        add("V2", f"SPICE vs JPL Horizons: Sun and Earth az/el from lunar surface sites "
                  f"({s['pairs']} + {e['pairs']} random site/time pairs, 2026–2031)",
            "≤ 0.005°", st(max(s["max_deg"], e["max_deg"]) <= 0.005),
            f"Sun max {s['max_deg']:.1e}° (RMS {s['rms_deg']:.1e}°); Earth max {e['max_deg']:.1e}° (RMS {e['rms_deg']:.1e}°)")
    else:
        add("V2", "SPICE vs Horizons", "≤ 0.005°", "not run", "—")

    r = load("V3")
    if r:
        ok = (abs(r["spice_el_deg"] - r["horizons_el_deg"]) <= 0.2
              and abs(r["spice_el_deg"] - r["published_el_deg"]) <= 0.2)
        add("V3", "Apollo 11 touchdown (1969-07-20 20:17:40 UTC): Sun elevation vs Horizons and vs the published value",
            "≤ 0.2°", st(ok),
            f"SPICE {r['spice_el_deg']:.3f}°, Horizons {r['horizons_el_deg']:.3f}°, published {r['published_el_deg']}° "
            f"({r['published_source']})")
    else:
        add("V3", "Apollo 11 Sun elevation", "≤ 0.2°", "not run", "—")

    a, b = load("V4_sphere"), load("V4_ring")
    if a and b:
        add("V4", "Synthetic terrain: smooth-sphere dip at 4 heights; Gaussian ring wall vs the exact profile",
            "≤ 1e-4°", st(a["max_err_deg"] <= 1e-4 and b["max_err_deg"] <= 1e-4),
            f"sphere {a['max_err_deg']:.1e}°, ring {b['max_err_deg']:.1e}°")
    else:
        add("V4", "Synthetic terrain", "≤ 1e-4°", "not run", "—")

    r = load("V5")
    if r:
        add("V5", "Azimuth wrap at north, off-pole site on the 180° meridian; rays leaving the DEM are flagged, not fatal",
            "no seam; ≤ 1e-3° vs exact terrain", st(r["seam_deg"] < 0.02 and r["max_err_vs_exact_deg"] <= 1e-3),
            f"seam {r['seam_deg']:.1e}°, max error {r['max_err_vs_exact_deg']:.1e}°")
    else:
        add("V5", "Azimuth wrap / DEM edge", "exact", "not run", "—")

    r = load("V6")
    if r:
        detail = "; ".join(f"{k} {v['max_change_deg']:.3f}°" for k, v in r["sites"].items())
        note = "" if r["coarse_dem_present"] else " (far-field DEM absent: search-radius doubling not exercised)"
        add("V6", "Convergence on real LOLA terrain: halve azimuth spacing and ray step, double the search radius (300 → 600 km)",
            "mask change ≤ 0.02°", st(r["worst_deg"] <= 0.02), detail + note)
    else:
        add("V6", "Mask convergence", "≤ 0.02°", "not run", "—")

    add("V7", "Raster sweep algorithm vs naive ray-marching", "≤ 0.01°", "not run",
        "Raster layers are not built yet, so there is nothing to compare.")

    r = load("V8")
    if r:
        add("V8", f"Rise/set event times vs brute-force 1 s scan ({r['events']} events, rugged synthetic mask, 12 days)",
            "≤ 5 s", st(r["max_abs_err_s"] <= 5), f"max {r['max_abs_err_s']:.2f} s")
    else:
        add("V8", "Event times", "≤ 5 s", "not run", "—")

    r = load("V9")
    if r:
        add("V9", "Sun-disk occlusion vs analytic circle-segment area", "≤ 1e-4",
            st(r["max_abs_err_4000_strips"] <= 1e-4),
            f"{r['max_abs_err_4000_strips']:.1e} (4000 strips); production setting, 200 strips: {r['abs_err_200_strips']:.1e}")
    else:
        add("V9", "Disk occlusion", "≤ 1e-4", "not run", "—")

    r = load("V10")
    if r:
        add("V10", "Energy integrator vs closed form (clipped sinusoid sampled like the app's time series)",
            "≤ 0.1 %", st(r["rel_err"] <= 1e-3), f"relative error {r['rel_err']:.1e}")
    else:
        add("V10", "Energy integrator vs closed-form flux", "≤ 0.1 %", "not run", "—")

    add("V11", "Ground-station geometry (Moon elevation at DSN sites) vs Horizons", "≤ 0.05°", "not run",
        "Ground-station windows are not implemented yet.")
    add("V12", "Hero sites vs Quickmap screenshots", "qualitative", "not run", "Manual comparison not done.")
    r = load("V13")
    if r:
        add("V13", "Front end: headless end-to-end flow (pick site, compare, custom site, share link, 3D globe, phone width)",
            "pass", st(r["failed"] == 0),
            f"{r['passed']} checks passed, {r['failed']} failed. axe and Lighthouse audits not run.")
    else:
        add("V13", "Front end e2e, axe, Lighthouse", "pass", "not run", "—")
    add("V14", "Clean clone → one command rebuilds artifacts with identical hashes", "pass", "not run",
        "A rebuild script exists; hash identity on a second machine was not verified.")

    r = load("browser_parity")
    if r:
        add("B1", f"Browser ephemeris (Chebyshev, TypeScript) vs rigorous SPICE topocentric az/el ({r['pairs']} pairs)",
            "≤ 0.001°", st(r["max_deg"] <= 0.001), f"max {r['max_deg']:.1e}°")
    r = load("runtime_shortcut")
    if r:
        add("B2", "Moon-centre vector minus site vector vs SPICE constant-position observer",
            "≤ 0.001°", st(r["max_deg"] <= 0.001), f"max {r['max_deg']:.1e}°")

    out = {"generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "checks": checks}
    (ROOT / "web" / "public" / "data" / "validation.json").write_text(
        json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = ["# Validation results", "",
             f"Generated {out['generated_utc']} by `pipeline/scripts/build_validation.py` from the test output "
             "recorded in `data/validation/`. Statuses are never hand-typed: a check with no recorded output is `not run`.",
             "", "| ID | Test | Pass criterion | Status | Measured |", "|---|---|---|---|---|"]
    for c in checks:
        lines.append(f"| {c['id']} | {c['test']} | {c['tolerance']} | {c['status']} | {c['result']} |")
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs" / "VALIDATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    for c in checks:
        print(f"{c['id']:<4}{c['status']:<8}{c['result']}".encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
