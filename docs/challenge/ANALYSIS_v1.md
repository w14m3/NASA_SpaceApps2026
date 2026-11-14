# Analyse du Lunar Landing Site Navigator v1 (revue externe, 14/11/2026)

Revue du code de `reference/v1/` (généré par Claude Code à partir du MASTER PROMPT v1.0), comparé à la page du challenge et au prompt v1. Document en français ; les points clés sont repris en anglais dans `docs/MASTER_PROMPT_V3.md` §5.

## Verdict
MVP scientifiquement sérieux : physique juste, testée, limites affichées honnêtement. Couvre M0–M5 du prompt v1 + une partie de M6. Manques : connectivité (DSN), alternatives « déplacer le site », couches raster, relief 3D, panorama, français, PDF, audits accessibilité, déploiement.

### Vérifications effectuées
| Vérification | Résultat |
|---|---|
| Tests navigateur (vitest) | 4/4 : parité éphémérides vs SPICE 2,7·10⁻⁵°, V8, V9, V10 |
| Tests pipeline synthétiques (pytest) | 5/5 : V4, V5, projection. V1, V2, V3, V6 nécessitent les noyaux + MNT (absents) |
| Build de production | OK. JS principal 88 Ko gzip, Cesium 1,1 Mo gzip à la demande, site 26 Mo |
| Lint (oxlint) | 0 erreur, 17 avertissements |
| e2e Playwright | 13/13 |
| Charge CPU | 4 sites / 30 j : 0,8 s. 4 sites / 365 j : 3,3 s, interface gelée ~2 s |
| Énergie sur terrain réel vs référence 2 min | ≤ 0,01 % sur 30 j, jusqu'à 0,74 % sur 365 j (cible 0,1 %) |

## Exigences : état dans v1
| Exigence | État |
|---|---|
| Sites curés + coordonnées libres | 26 sites sourcés ; relief pour 13 ; sites libres avec relief seulement au sud de 80,5°S ; cibles à venir absentes |
| Comparaison côte à côte | Tableau 4 sites + frises ; pas de sky plots superposés ni de deltas |
| Dates, jours lunaires, saisons | OK ; éphémérides 2026–2031 seulement |
| Soleil/Terre vs horizon | Sky plot complet (silhouette, bande ±1σ, disques à taille réelle) |
| Temps avant coucher | OK avec ± |
| Élévation solaire en évidence | Non : seulement dans la ligne de survol |
| Visualisations 2D/3D | Globe sans relief, carte polaire, sky plot, frise ; pas de relief 3D ni panorama |
| Tous niveaux | Case « Expert » ; pas de visite guidée, glossaire, FR |
| Libration | Calculée, jamais montrée |
| Énergie | 6 orientations, mât 2/10 m ; pas de modèle électrique ni batterie |
| Connectivité | Absente |
| Couches raster | Absentes |

## Architecture v1
- Pipeline Python : `fetch_data.py` (noyaux NAIF + MNT LOLA, SHA-256) ; `ephem.py` (SPICE MOON_ME, LT+S) ; `cheby.py` (Chebyshev degré 15, segments 4 j, 2026–2031, temps UTC, erreur 3·10⁻⁹°) ; `horizon.py` (numba, 1 440 azimuts, 300 km, pas 1 % de la distance plafonné à ½ px, 80 m puis 240 m, masques nominal/bas/haut, distance du point d'horizon) ; `horizons.py` (client JPL Horizons en cache) ; `build_*` (artefacts, validation générée).
- Navigateur : `core/` TypeScript pur (ephem, geom, horizon 240 m, visibility, analysis) ; `state.ts` (reducer + URL) ; composants Globe (Cesium), PolarMap (canvas), SkyPlot, Timeline, Workbench, Trust.

## Problèmes trouvés
1. À 2 m de mât, le terrain à moins de 500 m décide (Malapert M1 : horizon nord 4,2° à 0,5 km, ouest 2,0° à 0,1 km → nuit continue de 4 158 h sur un an ; à 10 m le Soleil passe chaque mois). La bande d'incertitude s'annule près du site.
2. IM-1 mal étiqueté « hors produit 80 m » (`in_fine = lat <= -80.5`).
3. Textes « demi-pixel » et « relief 80–90°S » incohérents avec le code.
4. Titre « N× un panneau plat » (38× à 61×) : référence trop facile.
5. Calculs sur le fil principal (gel ~2 s).
6. Éphémérides 2026–2031 seulement.
7. Divers : pas de `hashchange`, README Vite, images inutilisées, logo Cesium ion, 17 avertissements lint.

Vérifié correct : parité éphémérides, éclairage jour/nuit du globe, partage URL, mobile 390 px.

## Innovations proposées
Rejouer de vraies missions (Chandrayaan-3, IM-1, IM-2) · porkchop plot lunaire · ellipse d'atterrissage → risque · attitude du lander · « Qui me cache le Soleil ? » · boussole d'éclairage · boucle de libration et pointage d'antenne · ombres temps réel par cartes d'horizon · recherche par exigences · chiffres frappants (ombre d'un mât de 2 m avec le Soleil à 1,5° ≈ 76 m).
