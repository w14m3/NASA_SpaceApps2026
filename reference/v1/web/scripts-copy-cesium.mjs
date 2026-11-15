// Copies Cesium's runtime assets (workers, images, widgets CSS) into public/cesium so they are served at ./cesium/.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
const src = new URL('./node_modules/cesium/Build/Cesium/', import.meta.url)
const dst = new URL('./public/cesium/', import.meta.url)
if (!existsSync(new URL('Workers', dst))) {
  mkdirSync(dst, { recursive: true })
  for (const d of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) cpSync(new URL(d, src), new URL(d, dst), { recursive: true })
  console.log('copied Cesium assets to public/cesium')
}
