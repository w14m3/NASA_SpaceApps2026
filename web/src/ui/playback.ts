// Animation of the mission time (contract §6.5): advances t by `speed` simulated seconds per real second.
import { useEffect } from 'react'
import { DAY } from '../core/constants'
import { getState, setState, useStore } from './store'

export function usePlayback() {
  const playing = useStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const s = getState()
      const t1 = s.landing + s.durDays * DAY
      const t = s.t + dt * s.speed * 1000
      if (t >= t1) setState({ t: t1, playing: false })
      else setState({ t })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
