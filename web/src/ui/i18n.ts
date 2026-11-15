// English and French strings. Templates use {name} placeholders; numbers are formatted by the caller.
import { useStore, type Lang } from './store'

type Entry = { en: string; fr: string }
const D = {
  'app.tag': { en: 'Lunar Landing Site Navigator', fr: 'Navigateur de sites d’alunissage' },
  'app.promise': {
    en: 'Pick a region and a date. In seconds, get the three best places to land near the lunar south pole — safe to touch down, powered by the Sun, in contact with Earth — and see why.',
    fr: 'Choisissez une région et une date. En quelques secondes, obtenez les trois meilleurs sites d’alunissage près du pôle Sud lunaire — sûrs pour se poser, alimentés par le Soleil, en contact avec la Terre — et comprenez pourquoi.',
  },
  'mode.explore': { en: 'Explore', fr: 'Explorer' },
  'mode.plan': { en: 'Plan', fr: 'Planifier' },
  'mode.learn': { en: 'Learn', fr: 'Apprendre' },
  'nav.plan': { en: 'Plan a landing', fr: 'Planifier un alunissage' },
  'nav.compare': { en: 'Compare', fr: 'Comparer' },
  'nav.trust': { en: 'Methods & Trust', fr: 'Méthodes & confiance' },
  'nav.brief': { en: 'Mission Brief', fr: 'Dossier de mission' },
  'nav.back': { en: 'Back to the map', fr: 'Retour à la carte' },
  'nav.skip': { en: 'Skip to the map', fr: 'Aller à la carte' },
  'lang.switch': { en: 'Français', fr: 'English' },
  'view.pole': { en: 'South pole', fr: 'Pôle Sud' },
  'view.globe': { en: 'Globe', fr: 'Globe' },
  'view.site3d': { en: 'Site 3D', fr: 'Site 3D' },
  'view.street': { en: 'Street View', fr: 'Vue au sol' },
  'left.title': { en: 'Sites & comparison', fr: 'Sites & comparaison' },
  'search.label': { en: 'Search sites, features or "lat, lon"', fr: 'Chercher un site, un relief ou « lat, lon »' },
  'search.placeholder': { en: 'Search… e.g. Shackleton or -89.5, -140', fr: 'Chercher… ex. Shackleton ou -89.5, -140' },
  'search.coords': { en: 'Go to coordinates', fr: 'Aller aux coordonnées' },
  'search.none': { en: 'No match', fr: 'Aucun résultat' },
  'group.southPole': { en: 'South-pole targets', fr: 'Cibles du pôle Sud' },
  'group.clps': { en: 'CLPS & commercial', fr: 'CLPS & commerciales' },
  'group.apollo': { en: 'Apollo', fr: 'Apollo' },
  'group.international': { en: 'Other nations', fr: 'Autres nations' },
  'group.custom': { en: 'Custom', fr: 'Personnalisés' },
  'site.unverified': { en: 'coordinate unverified', fr: 'coordonnée non vérifiée' },
  'site.verified': { en: 'sourced', fr: 'sourcé' },
  'custom.title': { en: 'Custom coordinates', fr: 'Coordonnées personnalisées' },
  'custom.lat': { en: 'Latitude (°, south negative)', fr: 'Latitude (°, sud négatif)' },
  'custom.lon': { en: 'Longitude (°E, west negative)', fr: 'Longitude (°E, ouest négatif)' },
  'custom.apply': { en: 'Apply', fr: 'Appliquer' },
  'custom.invalid': { en: 'Latitude must be within −90…90 and longitude within −180…360.', fr: 'La latitude doit être entre −90 et 90, la longitude entre −180 et 360.' },
  'custom.hint': { en: 'Terrain horizons are available between 80°S and 90°S (LOLA 240 m). Elsewhere the horizon is a smooth sphere.', fr: 'Les horizons de relief sont disponibles entre 80°S et 90°S (LOLA 240 m). Ailleurs, l’horizon est celui d’une sphère lisse.' },
  'top3.title': { en: 'Top 3 for the crew', fr: 'Top 3 pour l’équipage' },
  'top3.computing': { en: 'Ranking {n} candidates…', fr: 'Classement de {n} candidats…' },
  'top3.none': { en: 'No candidate passes every constraint.', fr: 'Aucun candidat ne satisfait toutes les contraintes.' },
  'top3.relax': { en: 'Relax the tightest constraint', fr: 'Assouplir la contrainte la plus serrée' },
  'top3.feasible': { en: '{f} of {n} candidates pass the constraints', fr: '{f} candidats sur {n} satisfont les contraintes' },
  'top3.choose': { en: 'Choose this site', fr: 'Choisir ce site' },
  'top3.option': { en: 'Option {k}', fr: 'Option {k}' },
  'top3.bestDate': { en: 'Best landing date in the window: {d}', fr: 'Meilleure date d’alunissage dans la fenêtre : {d}' },
  'top3.risk': { en: 'Main risk', fr: 'Risque principal' },
  'top3.region': { en: 'Region', fr: 'Région' },
  'strength.safest': { en: 'Safest', fr: 'La plus sûre' },
  'strength.sunniest': { en: 'Most sunlight', fr: 'La plus ensoleillée' },
  'strength.bestLink': { en: 'Best Earth link', fr: 'Meilleur lien Terre' },
  'strength.balance': { en: 'Best balance', fr: 'Meilleur équilibre' },
  'reason.lit': { en: 'Sunlit {lit}% of the window (region median {med}%)', fr: 'Éclairé {lit} % de la fenêtre (médiane de la région {med} %)' },
  'reason.night': { en: 'Longest night {h} h (median {med} h)', fr: 'Plus longue nuit {h} h (médiane {med} h)' },
  'reason.dte': { en: 'Direct-to-Earth {dte}% of the time (median {med}%)', fr: 'Liaison directe Terre {dte} % du temps (médiane {med} %)' },
  'reason.gap': { en: 'Longest gap without Earth contact {h} h (median {med} h)', fr: 'Plus long silence radio {h} h (médiane {med} h)' },
  'reason.slope': { en: 'Gentle ground: {s}° slope (median {med}°)', fr: 'Terrain doux : pente {s}° (médiane {med}°)' },
  'reason.margin': { en: 'Tip-over margin {m}°; tips only above {v} m/s sideways', fr: 'Marge de basculement {m}° ; bascule seulement au-delà de {v} m/s latéral' },
  'reason.ice': { en: 'Zero-illumination cells {km} km away (ice science)', fr: 'Cellules jamais éclairées à {km} km (science de la glace)' },
  'risk.lit': { en: 'Sunlit only {lit}% of the window', fr: 'Éclairé seulement {lit} % de la fenêtre' },
  'risk.night': { en: 'Night of up to {h} h', fr: 'Nuit jusqu’à {h} h' },
  'risk.dte': { en: 'Earth contact only {dte}% of the time', fr: 'Contact Terre seulement {dte} % du temps' },
  'risk.gap': { en: 'Up to {h} h without Earth contact', fr: 'Jusqu’à {h} h sans contact Terre' },
  'risk.slope': { en: 'Slope {s}° at the DEM baseline', fr: 'Pente {s}° à la résolution du MNT' },
  'risk.margin': { en: 'Tip-over margin only {m}°', fr: 'Marge de basculement seulement {m}°' },
  'risk.ice': { en: 'Far from zero-illumination cells', fr: 'Loin des cellules jamais éclairées' },
  'risk.nearfield': { en: '{pct}% of the horizon is set by ground within 3 pixels: low confidence', fr: '{pct} % de l’horizon dépend du sol à moins de 3 pixels : confiance faible' },
  'layers.title': { en: 'Overlays', fr: 'Calques' },
  'layer.relief': { en: 'Topography (shaded relief)', fr: 'Topographie (relief ombré)' },
  'layer.lighting': { en: 'Lighting & shadows now', fr: 'Éclairage et ombres maintenant' },
  'layer.lit': { en: 'Mean illumination %', fr: 'Éclairement moyen %' },
  'layer.night': { en: 'Longest night (h)', fr: 'Plus longue nuit (h)' },
  'layer.zero': { en: 'Zero-illumination cells', fr: 'Cellules jamais éclairées' },
  'layer.earth': { en: 'Earth visibility %', fr: 'Visibilité de la Terre %' },
  'layer.dte': { en: 'Direct-to-Earth %', fr: 'Liaison directe Terre %' },
  'layer.slope': { en: 'Landing hazard: slope', fr: 'Danger : pente' },
  'layer.viability': { en: 'Viability index', fr: 'Indice de viabilité' },
  'layer.gain': { en: 'Mast gain 10 m vs 2 m', fr: 'Gain du mât 10 m vs 2 m' },
  'layer.rays': { en: 'Sun & Earth rays', fr: 'Rayons Soleil & Terre' },
  'layer.top3': { en: 'Top 3 pins', fr: 'Épingles Top 3' },
  'layer.pins': { en: 'Pinned sites', fr: 'Sites épinglés' },
  'layer.regions': { en: 'Hero regions', fr: 'Régions analysées' },
  'right.time': { en: 'Mission time (UTC)', fr: 'Heure de mission (UTC)' },
  'right.conditions': { en: 'Current conditions', fr: 'Conditions actuelles' },
  'cond.sun': { en: 'Sunlight', fr: 'Soleil' },
  'cond.dark': { en: 'Darkness', fr: 'Obscurité' },
  'cond.earth': { en: 'Earth link', fr: 'Lien Terre' },
  'cond.noEarth': { en: 'No Earth link', fr: 'Pas de lien Terre' },
  'cond.safe': { en: 'Safe ground', fr: 'Sol sûr' },
  'cond.caution': { en: 'Caution ground', fr: 'Sol à surveiller' },
  'cond.unsafe': { en: 'Unsafe ground', fr: 'Sol dangereux' },
  'cd.sunsets': { en: 'Sun sets in', fr: 'Coucher du Soleil dans' },
  'cd.sunrises': { en: 'Sun rises in', fr: 'Lever du Soleil dans' },
  'cd.earthsets': { en: 'Earth sets in', fr: 'Coucher de la Terre dans' },
  'cd.earthrises': { en: 'Earth rises in', fr: 'Lever de la Terre dans' },
  'cd.dteends': { en: 'DTE window ends in', fr: 'Fin de la fenêtre DTE dans' },
  'cd.dtestarts': { en: 'Next DTE window in', fr: 'Prochaine fenêtre DTE dans' },
  'cd.none': { en: 'no change within 45 days', fr: 'aucun changement sous 45 jours' },
  'card.solarEl': { en: 'Solar elevation above the terrain horizon', fr: 'Élévation solaire au-dessus de l’horizon de relief' },
  'card.solarElShort': { en: 'Sun above horizon', fr: 'Soleil au-dessus de l’horizon' },
  'card.trueEl': { en: 'true elevation {el}° · horizon at {m}° · disk visible {f}%', fr: 'élévation vraie {el}° · horizon à {m}° · disque visible {f} %' },
  'card.dte': { en: 'Direct-to-Earth window', fr: 'Fenêtre de liaison directe Terre' },
  'card.dteActive': { en: 'active — ends in {d}', fr: 'active — se termine dans {d}' },
  'card.dteNext': { en: 'closed — next in {d}', fr: 'fermée — prochaine dans {d}' },
  'card.stations': { en: 'Stations seeing the Moon: {s}', fr: 'Stations voyant la Lune : {s}' },
  'tradeoff.title': { en: 'Site trade-off', fr: 'Compromis entre sites' },
  'sky.title': { en: 'Horizon profile — sky plot', fr: 'Profil d’horizon — carte du ciel' },
  'sky.exag': { en: 'vertical axis ×{k}, for visibility', fr: 'axe vertical ×{k}, pour la lisibilité' },
  'sky.legend': { en: 'Terrain horizon with ±1σ band · Sun and Earth at true angular size · trails over the window · Earth libration loop', fr: 'Horizon de relief avec bande ±1σ · Soleil et Terre à leur taille angulaire réelle · trajectoires sur la fenêtre · boucle de libration de la Terre' },
  'timeline.title': { en: 'Timeline & controls', fr: 'Frise & commandes' },
  'timeline.play': { en: 'Play', fr: 'Lecture' },
  'timeline.pause': { en: 'Pause', fr: 'Pause' },
  'timeline.speed': { en: 'Speed', fr: 'Vitesse' },
  'timeline.window': { en: 'Window', fr: 'Fenêtre' },
  'timeline.slip': { en: 'Schedule slip', fr: 'Glissement de calendrier' },
  'timeline.lunarDay': { en: '+1 lunar day', fr: '+1 jour lunaire' },
  'track.sun': { en: 'Sun', fr: 'Soleil' },
  'track.earth': { en: 'Earth in view', fr: 'Terre visible' },
  'track.dte': { en: 'DTE', fr: 'DTE' },
  'track.both': { en: 'Sun + DTE', fr: 'Soleil + DTE' },
  'units.h': { en: 'h', fr: 'h' },
  'units.d': { en: 'd', fr: 'j' },
  'wb.verdict': { en: 'Verdict', fr: 'Verdict' },
  'wb.power': { en: 'Power', fr: 'Énergie' },
  'wb.link': { en: 'Link', fr: 'Liaison' },
  'wb.safety': { en: 'Safety', fr: 'Sécurité' },
  'wb.combined': { en: 'Combined', fr: 'Global' },
  'wb.grade': { en: 'Confidence', fr: 'Confiance' },
  'wb.metrics': { en: 'Metrics over the window', fr: 'Mesures sur la fenêtre' },
  'wb.energy': { en: 'Solar energy', fr: 'Énergie solaire' },
  'wb.connectivity': { en: 'Earth connectivity', fr: 'Connectivité Terre' },
  'wb.safetyPanel': { en: 'Landing safety (screening)', fr: 'Sécurité d’alunissage (dépistage)' },
  'wb.thermal': { en: 'Thermal (proxy)', fr: 'Thermique (indicateur)' },
  'wb.exports': { en: 'Export', fr: 'Exporter' },
  'wb.mast': { en: 'Mast height', fr: 'Hauteur du mât' },
  'wb.pin': { en: 'Pin for comparison', fr: 'Épingler pour comparer' },
  'wb.unpin': { en: 'Unpin', fr: 'Désépingler' },
  'wb.share': { en: 'Copy share link', fr: 'Copier le lien' },
  'wb.copied': { en: 'Link copied', fr: 'Lien copié' },
  'wb.quickmap': { en: 'Open in QuickMap', fr: 'Ouvrir dans QuickMap' },
  'wb.street': { en: 'Street View', fr: 'Vue au sol' },
  'wb.illumNotPower': { en: 'Illumination is not electrical power: conversion uses the assumptions shown.', fr: 'L’éclairement n’est pas de la puissance électrique : la conversion utilise les hypothèses affichées.' },
  'wb.visNotLink': { en: 'Geometric visibility, not link closure.', fr: 'Visibilité géométrique, pas bilan de liaison.' },
  'wb.screening': { en: 'Screening estimate at the {b} m DEM baseline ({dem}).', fr: 'Estimation de dépistage à la base de {b} m du MNT ({dem}).' },
  'terrain.precomputed': { en: 'Horizon: LOLA 80 m + 240 m (precomputed, validated)', fr: 'Horizon : LOLA 80 m + 240 m (précalculé, validé)' },
  'terrain.live': { en: 'Horizon: LOLA 240 m, computed in your browser (screening resolution)', fr: 'Horizon : LOLA 240 m, calculé dans votre navigateur (résolution de dépistage)' },
  'terrain.sphere': { en: 'No terrain data here: smooth-sphere horizon', fr: 'Pas de relief ici : horizon de sphère lisse' },
  'grade.A': { en: 'A — horizon mostly set by distant terrain, 5 m DEM', fr: 'A — horizon surtout lointain, MNT 5 m' },
  'grade.B': { en: 'B — under 25% of the horizon set by ground within 3 pixels', fr: 'B — moins de 25 % de l’horizon dépend du sol à moins de 3 pixels' },
  'grade.C': { en: 'C — horizon largely set by nearby ground: low confidence', fr: 'C — horizon largement fixé par le sol proche : confiance faible' },
  'grade.—': { en: 'no terrain', fr: 'pas de relief' },
  'loading': { en: 'Loading…', fr: 'Chargement…' },
  'computing': { en: 'Computing…', fr: 'Calcul…' },
  'outside': { en: 'Date outside the ephemeris span (2017-01-01 to 2031-01-02).', fr: 'Date hors de la période des éphémérides (2017-01-01 au 2031-01-02).' },
  'credits': {
    en: 'Data: NASA LRO/LOLA (GSFC PGDA, Barker et al. 2023), LROC/ASU via NASA Moon Trek, JPL/NAIF & JPL DE421/DE440 ephemerides, JPL Horizons (validation), USGS, CSA. Not endorsed by NASA.',
    fr: 'Données : NASA LRO/LOLA (GSFC PGDA, Barker et al. 2023), LROC/ASU via NASA Moon Trek, éphémérides JPL/NAIF DE421/DE440, JPL Horizons (validation), USGS, ASC. Sans approbation de la NASA.',
  },
} satisfies Record<string, Entry>

export type Key = keyof typeof D

export function translate(lang: Lang, key: Key | string, vars?: Record<string, string | number>): string {
  const e = (D as Record<string, Entry>)[key]
  let s = e ? e[lang] : key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, typeof v === 'number' ? fmtNum(v, lang) : v)
  return s
}

export function fmtNum(v: number, lang: Lang, digits?: number): string {
  if (!Number.isFinite(v)) return '—'
  const d = digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)
  return v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function useT() {
  const lang = useStore((s) => s.lang)
  return {
    lang,
    t: (key: Key | string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    n: (v: number, digits?: number) => fmtNum(v, lang, digits),
  }
}

export function hasKey(k: string) {
  return k in D
}

/** Duration in the UI: s, min, h or d with one decimal. */
export function fmtDur(ms: number | null, lang: Lang): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const a = Math.abs(ms)
  if (a < 1000) return '< 1 s'
  if (a < 90_000) return `${Math.round(a / 1000)} s`
  if (a < 2 * 3_600_000) return `${Math.round(a / 60_000)} min`
  if (a < 3 * 86_400_000) return `${fmtNum(a / 3_600_000, lang, 1)} h`
  return `${fmtNum(a / 86_400_000, lang, 1)} ${lang === 'fr' ? 'j' : 'd'}`
}

export function fmtUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export function fmtLat(lat: number) {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}`
}
export function fmtLon(lon: number) {
  return `${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`
}
