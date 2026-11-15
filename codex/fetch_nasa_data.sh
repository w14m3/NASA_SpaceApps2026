#!/usr/bin/env bash
# Resumable download of the NASA inputs into data/cache/ (git-ignored), with SHA-256 manifest.
# Idempotent: existing complete files are kept. Safe to re-run. Sources are documented in docs/RESOURCES.md.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/data/cache"
mkdir -p "$CACHE/kernels" "$CACHE/dem"
NAIF="https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
PGDA="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"

fetch() { # url dest
  local url="$1" dest="$2"
  if [ -s "$dest" ] && [ ! -f "$dest.part" ]; then echo "ok    $(basename "$dest")"; return 0; fi
  echo "GET   $url"
  if curl -fL --retry 5 --retry-delay 5 --connect-timeout 30 -C - -o "$dest.part" "$url"; then
    mv "$dest.part" "$dest"; echo "done  $(basename "$dest")"
  else
    echo "FAIL  $url" >&2; return 1
  fi
}

latest() { # dir-url regex -> newest matching file name in a NAIF directory listing
  curl -fsL --connect-timeout 30 "$1/" | grep -oE "$2" | sort -u | tail -1
}

# --- SPICE kernels (NAIF generic kernels) ---
fetch "$NAIF/lsk/naif0012.tls"                        "$CACHE/kernels/naif0012.tls"
fetch "$NAIF/pck/pck00011.tpc"                        "$CACHE/kernels/pck00011.tpc"
fetch "$NAIF/pck/moon_pa_de440_200625.bpc"            "$CACHE/kernels/moon_pa_de440_200625.bpc"
fetch "$NAIF/fk/satellites/moon_de440_250416.tf"      "$CACHE/kernels/moon_de440_250416.tf"
fetch "$NAIF/spk/planets/de440s.bsp"                  "$CACHE/kernels/de440s.bsp"
# Earth orientation and DSN station kernels are re-issued with new dates: pick the newest listed file.
EOP=$(latest "$NAIF/pck" 'earth_[0-9]{4}_[0-9]{6}_[0-9]{4}_combined\.bpc')
[ -n "$EOP" ] && fetch "$NAIF/pck/$EOP" "$CACHE/kernels/$EOP"
STN=$(latest "$NAIF/spk/stations" 'earthstns_itrf93_[0-9]{6}\.bsp')
[ -n "$STN" ] && fetch "$NAIF/spk/stations/$STN" "$CACHE/kernels/$STN"
TOPO=$(latest "$NAIF/fk/stations" 'earth_topo_[0-9]{6}\.tf')
[ -n "$TOPO" ] && fetch "$NAIF/fk/stations/$TOPO" "$CACHE/kernels/$TOPO"

# --- LOLA south-pole DEMs (PGDA product 90). 20 m and 5 m products are read as windows by the pipeline. ---
fetch "$PGDA/LDEM_80S_80MPP_ADJ.TIF"      "$CACHE/dem/LDEM_80S_80MPP_ADJ.TIF"
fetch "$PGDA/LDEM_80S_80MPP_ADJ_ERR.TIF"  "$CACHE/dem/LDEM_80S_80MPP_ADJ_ERR.TIF"
fetch "$PGDA/LDEM_60S_240MPP_ADJ.TIF"     "$CACHE/dem/LDEM_60S_240MPP_ADJ.TIF"

( cd "$CACHE" && find . -type f ! -name '*.part' ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )
echo "manifest: $CACHE/SHA256SUMS"
exit 0
