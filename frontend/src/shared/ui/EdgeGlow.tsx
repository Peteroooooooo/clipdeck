import { useEffect, useRef } from 'react'
import EdgeGlowWorker from './edgeGlow.worker?worker&inline'
import type { EdgeGlowMessage } from './edgeGlow.worker'
import { frameDivisor, onFrameDivisor } from './frameRate'

interface EdgeGlowProps {
  /** Glows while something is in progress (the search box is in use). */
  active: boolean
}

let reducedMotionQuery: MediaQueryList | null | undefined
let prefersReducedMotion = false

function isReducedMotion() {
  if (reducedMotionQuery === undefined) {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      prefersReducedMotion = reducedMotionQuery.matches
      reducedMotionQuery.addEventListener?.('change', (event) => {
        prefersReducedMotion = event.matches
      })
    } else {
      reducedMotionQuery = null
    }
  }
  return prefersReducedMotion
}

function motionAllowed() {
  return !(document.documentElement.classList.contains('no-motion') || isReducedMotion())
}

/**
 * Siri-style light seeping in from the window's edges while the search is in use. A worker draws
 * it (edgeGlow.worker.ts, shader in edgeGlowShader.ts) only while it can be seen: lit, fading
 * out, and the panel not asleep in the tray, where WebView2 would otherwise keep drawing every
 * frame for nobody. The page tells it the canvas size and whether to glow.
 */
export function EdgeGlow({ active }: EdgeGlowProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeRef = useRef(active)
  const kick = useRef<() => void>(() => undefined)

  useEffect(() => {
    const host = ref.current
    const canvas = canvasRef.current
    // No worker canvas (jsdom in the tests): then there is simply no glow.
    if (!host || !canvas || typeof Worker === 'undefined' || !('transferControlToOffscreen' in canvas)) return
    const root = document.documentElement
    let worker: Worker | null = null
    let lastResize: { width: number; height: number; dpr: number; radius: number } | null = null
    let lastState: { lit: boolean; asleep: boolean; motion: boolean; divisor: number } | null = null

    const post = (message: EdgeGlowMessage) => worker?.postMessage(message)
    const measure = () => {
      if (!worker) return
      const rect = host.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const dpr = window.devicePixelRatio || 1
      const radius = Number.parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0
      const width = Math.round(rect.width * dpr)
      const height = Math.round(rect.height * dpr)
      if (
        lastResize &&
        lastResize.width === width &&
        lastResize.height === height &&
        lastResize.dpr === dpr &&
        lastResize.radius === radius
      ) {
        return
      }
      lastResize = { width, height, dpr, radius }
      post({ type: 'resize', width, height, dpr, radius })
    }
    const sendState = () => {
      if (!worker) return
      const lit = activeRef.current
      const asleep = root.classList.contains('is-asleep')
      const motion = motionAllowed()
      const divisor = frameDivisor()
      if (
        lastState &&
        lastState.lit === lit &&
        lastState.asleep === asleep &&
        lastState.motion === motion &&
        lastState.divisor === divisor
      ) {
        return
      }
      lastState = { lit, asleep, motion, divisor }
      post({ type: 'state', lit, asleep, motion, divisor })
    }
    const start = () => {
      if (worker) return
      try {
        const offscreen = canvas.transferControlToOffscreen()
        worker = new EdgeGlowWorker()
        worker.postMessage({ type: 'init', canvas: offscreen } satisfies EdgeGlowMessage, [offscreen])
      } catch {
        return
      }
      measure()
      sendState()
    }

    kick.current = () => {
      start()
      sendState()
    }

    // Started (and the shader compiled) while idle after launch, so the first search does not wait.
    const warm = window.setTimeout(start, 1500)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resizeObserver?.observe(host)
    // Into the tray and back (is-asleep), or motion switched off (no-motion).
    let wasAsleep = root.classList.contains('is-asleep')
    let wasNoMotion = root.classList.contains('no-motion')
    const classObserver = new MutationObserver(() => {
      const isAsleep = root.classList.contains('is-asleep')
      const isNoMotion = root.classList.contains('no-motion')
      if (isAsleep === wasAsleep && isNoMotion === wasNoMotion) return
      if (wasAsleep && !isAsleep) measure()
      wasAsleep = isAsleep
      wasNoMotion = isNoMotion
      sendState()
    })
    classObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
    const stopFollowingRate = onFrameDivisor(sendState)
    if (activeRef.current) kick.current()

    return () => {
      window.clearTimeout(warm)
      resizeObserver?.disconnect()
      classObserver.disconnect()
      stopFollowingRate()
      worker?.terminate()
      kick.current = () => undefined
    }
  }, [])

  useEffect(() => {
    activeRef.current = active
    kick.current()
  }, [active])

  return (
    <div aria-hidden="true" className={`edge-glow ${active ? 'is-active' : ''}`} ref={ref}>
      <canvas className="edge-glow-canvas" ref={canvasRef} />
    </div>
  )
}
