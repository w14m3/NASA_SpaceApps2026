import { setState, useStore, type Mode } from './store'
import { useT } from './i18n'

export const PRODUCT_NAME = 'Sightline'

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#0e1626" stroke="#24324d" />
      <circle cx="32" cy="36" r="19" fill="#c9ced6" />
      <circle cx="24" cy="40" r="3" fill="#8a919c" />
      <circle cx="38" cy="45" r="2" fill="#8a919c" />
      <path d="M5 40 Q32 27 59 40" stroke="#f7bd4a" strokeWidth="3" fill="none" />
      <circle cx="47" cy="17" r="5" fill="#f7bd4a" />
      <circle cx="16" cy="15" r="3.5" fill="#5cb2ff" />
    </svg>
  )
}

export function TopBar() {
  const mode = useStore((s) => s.mode)
  const lang = useStore((s) => s.lang)
  const { t } = useT()
  const setMode = (m: Mode) => setState({ mode: m, tour: m === 'learn' ? 0 : -1 })
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <b>{PRODUCT_NAME}</b>
          <small>{t('app.tag')}</small>
        </div>
      </div>
      <div className="seg" role="group" aria-label="Mode">
        {(['explore', 'plan', 'learn'] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(`mode.${m}`)}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button className="btn primary" onClick={() => setState({ wizard: true })} data-testid="plan-landing">
        {t('nav.plan')}
      </button>
      <button className="btn" onClick={() => setState({ page: 'compare' })} data-testid="nav-compare">
        {t('nav.compare')}
      </button>
      <button className="btn" onClick={() => setState({ page: 'trust' })} data-testid="nav-trust">
        {t('nav.trust')}
      </button>
      <button className="btn ghost" onClick={() => setState({ lang: lang === 'en' ? 'fr' : 'en' })} lang={lang === 'en' ? 'fr' : 'en'} data-testid="lang">
        {t('lang.switch')}
      </button>
    </header>
  )
}
