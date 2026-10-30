// The search glow's frame loop (EdgeGlow.tsx), off the page's main thread: the page hands over its
// canvas once and then only says how big it is and whether the glow should be lit. Measured in
// the app on a 240 Hz screen, drawing here at half the refresh rate instead of on the page at
// every frame took the renderer from about 50% to 18% of a core and the GPU process from about
// 95% to 57%.

import { createEdgeGlowRenderer, type EdgeGlowRenderer } from './edgeGlowShader'

export type EdgeGlowMessage =
  | { type: 'init'; canvas: OffscreenCanvas }
  | { type: 'resize'; width: number; height: number; dpr: number; radius: number }
  | { type: 'state'; lit: boolean; asleep: boolean; motion: boolean; divisor: number }

// Comes up over FADE_IN_MS, goes out over FADE_OUT_MS; arriving, the light first reaches
// BLOOM_REACH times as far in, settling back within BLOOM_MS.
const FADE_IN_MS = 250
const FADE_OUT_MS = 350
const BLOOM_MS = 450
const BLOOM_REACH = 1.35

const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

let canvas: OffscreenCanvas | null = null
let renderer: EdgeGlowRenderer | null = null
let size: [number, number, number, number] | null = null
let frame = 0
// Draws one screen frame in `divisor` (frameRate.ts: every other frame from 120 Hz up).
let divisor = 1
let skipped = 0
let lit = false
let asleep = false
let motion = true
let changedAt = performance.now()
// Presence when the last change happened, so a quick toggle turns round where it is.
let presenceFrom = 0
let startedAt = changedAt

const presenceAt = (now: number) => {
  const k = now - changedAt
  if (!motion) return lit ? 1 : 0
  if (lit) return presenceFrom + (1 - presenceFrom) * easeOut(Math.min(1, k / FADE_IN_MS))
  return presenceFrom * (1 - easeOut(Math.min(1, k / FADE_OUT_MS)))
}
const reachAt = (now: number) => {
  if (!lit || presenceFrom > 0 || !motion) return 1
  const k = Math.min(1, (now - changedAt) / BLOOM_MS)
  return k < 0.45
    ? BLOOM_REACH * easeOut(k / 0.45)
    : BLOOM_REACH - (BLOOM_REACH - 1) * easeInOut((k - 0.45) / 0.55)
}

const ensureRenderer = () => {
  if (!renderer && canvas) {
    renderer = createEdgeGlowRenderer(canvas)
    if (renderer && size) renderer.resize(...size)
  }
  return renderer
}

const draw = (now: number) => {
  frame = 0
  if (!renderer || !size || asleep) return
  const presence = presenceAt(now)
  const going = (lit || presence > 0) && motion
  if (going && ++skipped < divisor) {
    frame = requestAnimationFrame(draw)
    return
  }
  skipped = 0
  renderer.draw({ time: (now - startedAt) / 1000, presence, reach: reachAt(now) })
  if (going) frame = requestAnimationFrame(draw)
}
// force: one frame even when going out, so a glow switched off without motion is cleared.
const wake = (force = false) => {
  if (!frame && (force || lit || presenceAt(performance.now()) > 0) && ensureRenderer()) {
    frame = requestAnimationFrame(draw)
  }
}

self.onmessage = (event: MessageEvent<EdgeGlowMessage>) => {
  const message = event.data
  if (message.type === 'init') {
    canvas = message.canvas
    canvas.addEventListener('contextlost', (lost) => {
      lost.preventDefault()
      renderer = null
    })
    canvas.addEventListener('contextrestored', () => wake())
    // Compiled now, while idle after launch, so the first search does not wait for it.
    ensureRenderer()
    return
  }
  if (message.type === 'resize') {
    size = [message.width, message.height, message.dpr, message.radius]
    renderer?.resize(...size)
    wake()
    return
  }

  asleep = message.asleep
  motion = message.motion
  divisor = message.divisor
  if (message.lit === lit) {
    wake()
    return
  }
  const now = performance.now()
  const presence = presenceAt(now)
  lit = message.lit
  presenceFrom = presence
  changedAt = now
  // A fresh light starts its waves from the beginning (and time stays small for the shader).
  if (lit && presence <= 0) startedAt = now
  wake(true)
}
