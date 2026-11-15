// Learn mode: a five-step guided tour (contract §6.13) and a glossary. Every number is computed by the core.
import { useMemo } from 'react'
import { D2R } from '../core/constants'
import { setState, useStore } from './store'
import { useT } from './i18n'

const STEPS = [
  {
    en: ['Why is the south pole so hard?', 'The Moon’s axis is tilted only about 1.5° to the ecliptic, so at the pole the Sun skims the horizon all lunar day long and circles 360° in azimuth every 29.5 days. Watch the yellow trail on the sky plot: it never climbs far.'],
    fr: ['Pourquoi le pôle Sud est-il si difficile ?', 'L’axe de la Lune n’est incliné que d’environ 1,5° sur l’écliptique : au pôle, le Soleil rase l’horizon toute la journée lunaire et fait le tour complet en azimut en 29,5 jours. Regardez la trace jaune de la carte du ciel : elle ne monte jamais haut.'],
    view: 'pole',
  },
  {
    en: ['Terrain decides', 'With the Sun that low, a ridge a few kilometres away can hide it for days. The grey silhouette is the real horizon computed from NASA LOLA laser altimetry. Raise the mast from 2 m to 10 m in the workbench and see nights shrink.'],
    fr: ['Le relief décide', 'Avec un Soleil aussi bas, une crête à quelques kilomètres peut le cacher pendant des jours. La silhouette grise est l’horizon réel calculé à partir de l’altimétrie laser LOLA de la NASA. Passez le mât de 2 m à 10 m et regardez les nuits raccourcir.'],
    view: 'street',
  },
  {
    en: ['Earth wobbles', 'Earth never moves far in the lunar sky, but libration makes it trace a loop of about ±7° — the blue loop on the sky plot. Near the pole Earth hovers at the horizon, so a small hill can cut the radio link.'],
    fr: ['La Terre oscille', 'La Terre bouge peu dans le ciel lunaire, mais la libration lui fait décrire une boucle d’environ ±7° — la boucle bleue de la carte du ciel. Près du pôle, la Terre reste à l’horizon : une petite colline peut couper la liaison radio.'],
    view: 'pole',
  },
  {
    en: ['Landing needs flat ground', 'Slopes are screened from the DEM: a tilted lander can tip over if it touches down moving sideways. The safety gauge turns the slope into a critical sideways speed for a generic lander.'],
    fr: ['Il faut un sol plat', 'Les pentes sont évaluées à partir du MNT : un atterrisseur incliné peut basculer s’il touche le sol en glissant. La jauge transforme la pente en vitesse latérale critique pour un atterrisseur générique.'],
    view: 'site3d',
  },
  {
    en: ['Three options for the crew', 'Sightline ranks thousands of candidate spots on safety, sunlight and Earth contact, keeps three that are at least 1 km apart, and explains each. Choose one to produce the Mission Brief.'],
    fr: ['Trois options pour l’équipage', 'Sightline classe des milliers de points candidats selon la sécurité, l’ensoleillement et le contact avec la Terre, garde trois options espacées d’au moins 1 km et explique chacune. Choisissez-en une pour produire le dossier de mission.'],
    view: 'pole',
  },
] as const

export function Tour() {
  const step = useStore((s) => s.tour)
  const lang = useStore((s) => s.lang)
  const { t } = useT()
  if (step < 0 || step >= STEPS.length) return null
  const s = STEPS[step]
  const [title, body] = s[lang]
  return (
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title" data-testid="tour">
      <div className="hint">
        {t('mode.learn')} · {step + 1}/{STEPS.length}
      </div>
      <h2 id="tour-title" style={{ margin: '4px 0 6px', fontSize: 16 }}>
        {title}
      </h2>
      <p>{body}</p>
      {step === 1 && <FunFact />}
      <div className="row">
        <button className="btn small" disabled={step === 0} onClick={() => setState({ tour: step - 1, view: STEPS[step - 1].view })}>
          ←
        </button>
        <button className="btn primary small" onClick={() => setState(step + 1 < STEPS.length ? { tour: step + 1, view: STEPS[step + 1].view } : { tour: -1 })} data-testid="tour-next">
          {step + 1 < STEPS.length ? '→' : '✔'}
        </button>
        <span className="spacer" />
        <button className="btn ghost small" onClick={() => setState({ tour: -1 })}>
          ✕
        </button>
      </div>
      <Glossary />
    </div>
  )
}

function FunFact() {
  const lang = useStore((s) => s.lang)
  // shadow length of a 2 m mast with the Sun 1.5° above a flat horizon: 2 / tan(1.5°)
  const L = useMemo(() => 2 / Math.tan(1.5 * D2R), [])
  return (
    <p className="hint" data-testid="funfact">
      {lang === 'fr'
        ? `Sur la Lune comme sur Terre, l’ombre d’un mât de 2 m avec le Soleil à 1,5° mesure ${L.toFixed(0)} m — mais au pôle Sud lunaire, c’est la situation normale de toute la journée.`
        : `With the Sun 1.5° up, a 2 m mast casts a ${L.toFixed(0)} m shadow — at the lunar south pole that is the normal situation all day long.`}
    </p>
  )
}

const GLOSSARY: Record<string, { en: string; fr: string }> = {
  'Terrain horizon': { en: 'The elevation of the skyline in each direction, computed from the DEM including the Moon’s curvature.', fr: 'L’élévation de la ligne d’horizon dans chaque direction, calculée à partir du MNT en tenant compte de la courbure lunaire.' },
  'DTE (direct-to-Earth)': { en: 'Earth is visible from the lander and a ground station on Earth sees the Moon: a direct radio path is geometrically possible.', fr: 'La Terre est visible depuis l’atterrisseur et une station au sol voit la Lune : une liaison radio directe est géométriquement possible.' },
  Libration: { en: 'The apparent wobble of the Moon seen from Earth (and of Earth seen from the Moon), about ±7.9° in longitude and ±6.7° in latitude.', fr: 'L’oscillation apparente de la Lune vue de la Terre (et de la Terre vue de la Lune), environ ±7,9° en longitude et ±6,7° en latitude.' },
  'DEM baseline': { en: 'The ground distance over which a slope is measured; coarser data hide steeper small-scale slopes.', fr: 'La distance au sol sur laquelle une pente est mesurée ; des données grossières masquent les pentes locales plus fortes.' },
  'Confidence grade': { en: 'A, B or C depending on how much of the horizon is set by ground within three pixels of the site, where the DEM is least reliable.', fr: 'A, B ou C selon la part de l’horizon fixée par le sol à moins de trois pixels du site, là où le MNT est le moins fiable.' },
}

function Glossary() {
  const lang = useStore((s) => s.lang)
  return (
    <details style={{ marginTop: 8 }}>
      <summary>{lang === 'fr' ? 'Glossaire' : 'Glossary'}</summary>
      <dl data-testid="glossary">
        {Object.entries(GLOSSARY).map(([k, v]) => (
          <div key={k}>
            <dt style={{ fontWeight: 650 }}>{k}</dt>
            <dd style={{ margin: '0 0 6px', color: 'var(--muted)' }}>{v[lang]}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
