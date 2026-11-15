// Typed RPC to the analysis Web Worker (all heavy computation off the main thread; contract §8).
import type { Api } from '../workers/analysis.worker'

type Fn = (...a: never[]) => unknown
type Promisified<T> = { [K in keyof T]: T[K] extends Fn ? (arg: Parameters<T[K]>[0], onProgress?: (f: number) => void) => Promise<Awaited<ReturnType<T[K]>>> : never }

function makeClient<A>(): Promisified<A> {
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { res: (v: unknown) => void; rej: (e: unknown) => void; prog?: (f: number) => void }>()

function w(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error, progress } = e.data
      const p = pending.get(id)
      if (!p) return
      if (progress !== undefined) return p.prog?.(progress)
      pending.delete(id)
      if (error) p.rej(new Error(error))
      else p.res(result)
    }
    worker.postMessage({ id: 0, method: 'init', arg: { base: new URL(import.meta.env.BASE_URL ?? './', location.href).href } })
  }
  return worker
}

return new Proxy({} as Promisified<A>, {
  get: (_t, method: string) => (arg: unknown, onProgress?: (f: number) => void) =>
    new Promise((res, rej) => {
      const id = ++seq
      pending.set(id, { res, rej, prog: onProgress })
      w().postMessage({ id, method, arg })
    }),
})
}

/** analysis worker (sites, Top 3) */
export const rpc = makeClient<Api>()
/** second instance of the same worker for map layers, so layers never wait behind a ranking */
export const rpcLayers = makeClient<Api>()
