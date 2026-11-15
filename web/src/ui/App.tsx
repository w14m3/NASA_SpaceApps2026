import { lazy, Suspense, useEffect } from 'react'
import { setState, useStore } from './store'
import { useT } from './i18n'
import { TopBar } from './TopBar'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { Stage } from './Stage'
import { Timeline } from './Timeline'
import { usePlayback } from './playback'
import { Tour } from './Learn'
import { ExploreShell } from './ExploreShell'

const Trust = lazy(() => import('./Trust'))
const Brief = lazy(() => import('./Brief'))
const Compare = lazy(() => import('./Compare'))
const Wizard = lazy(() => import('./Wizard'))

export function App() {
  const page = useStore((s) => s.page)
  const wizard = useStore((s) => s.wizard)
  const mode = useStore((s) => s.mode)
  const lang = useStore((s) => s.lang)
  const { t } = useT()
  usePlayback()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return (
    <>
      <a className="skip" href={mode === 'explore' ? '#explore-map' : '#stage'}>
        {t('nav.skip')}
      </a>
      {mode === 'explore' ? (
        <div aria-hidden={page !== 'main' ? true : undefined}>
          <ExploreShell />
        </div>
      ) : (
      <div className="app" aria-hidden={page !== 'main' ? true : undefined}>
        <TopBar />
        <aside className="left panel" aria-label={t('left.title')}>
          <LeftPanel />
        </aside>
        <main className="stage" id="stage" tabIndex={-1}>
          <Stage />
        </main>
        <aside className="right panel" aria-label={t('right.conditions')}>
          <RightPanel />
        </aside>
        <section className="dock panel" aria-label={t('timeline.title')}>
          <Timeline />
        </section>
      </div>
      )}
      <Suspense fallback={<div className="toast">{t('loading')}</div>}>
        {page === 'trust' && <Trust />}
        {page === 'brief' && <Brief />}
        {page === 'compare' && <Compare />}
        {wizard && <Wizard onClose={() => setState({ wizard: false })} />}
      </Suspense>
      <Tour />
    </>
  )
}
