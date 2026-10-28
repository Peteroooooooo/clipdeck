import { useEffect, useRef } from 'react'
import { createEdgeGlowRenderer, type EdgeGlowRenderer } from './edgeGlowShader'

// Comes up over FADE_IN_MS, goes out over FADE_OUT_MS; arriving, the light first reaches
// BLOOM_REACH times as far in, settling back within BLOOM_MS.
const FADE_IN_MS = 250
const FADE_OUT_MS = 350
const BLOOM_MS = 450
const BLOOM_REACH = 1.35

interface EdgeGlowProps {
  /** Glows while something is in progress (the search box is in use). */
  active: boolean
}

const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

function motionAllowed() {
  return !(
    document.documentElement.classList.contains('no-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Siri-style light seeping in from the window's edges while the search is in use (the shader is
 * in edgeGlowShader.ts). It draws only while it can be seen: lit, fading out, and the panel not
 * asleep in the tray, where WebView2 would otherwise keep drawing every frame for nobody.
 */
export function EdgeGlow({ active }: EdgeGlowProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeRef = useRef(active)
  const kick = useRef<() => void>(() => undefined)

  useEffect(() => {
    const host = ref.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const root = document.documentElement

    let renderer: EdgeGlowRenderer | null = null
    let frame = 0
    let measured = false
    let lit = activeRef.current
    let changedAt = performance.now()
    // Presence when the last change happened, so a quick toggle turns round where it is.
    let presenceFrom = 0
    let startedAt = changedAt

    const presenceAt = (now: number) => {
      const k = now - changedAt
      if (!motionAllowed()) return lit ? 1 : 0
      if (lit) return presenceFrom + (1 - presenceFrom) * easeOut(Math.min(1, k / FADE_IN_MS))
      return presenceFrom * (1 - easeOut(Math.min(1, k / FADE_OUT_MS)))
    }
    const reachAt = (now: number) => {
      if (!lit || presenceFrom > 0 || !motionAllowed()) return 1
      const k = Math.min(1, (now - changedAt) / BLOOM_MS)
      return k < 0.45
        ? BLOOM_REACH * easeOut(k / 0.45)
        : BLOOM_REACH - (BLOOM_REACH - 1) * easeInOut((k - 0.45) / 0.55)
    }

    const ensureRenderer = () => {
      renderer ??= createEdgeGlowRenderer(canvas)
      return renderer
    }
    const measure = () => {
      if (!renderer) return
      const rect = host.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const dpr = window.devicePixelRatio || 1
      const radius = Number.parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0
      renderer.resize(Math.round(rect.width * dpr), Math.round(rect.height * dpr), dpr, radius)
      measured = true
    }

    const draw = (now: number) => {
      frame = 0
      if (!renderer || root.classList.contains('is-asleep')) return
      if (!measured) measure()
      const presence = presenceAt(now)
      renderer.draw({ time: (now - startedAt) / 1000, presence, reach: reachAt(now) })
      if ((lit || presence > 0) && motionAllowed()) frame = requestAnimationFrame(draw)
    }
    // force: one frame even when going out, so a glow switched off without motion is cleared.
    const wake = (force = false) => {
      if (!frame && (force || lit || presenceAt(performance.now()) > 0) && ensureRenderer()) {
        frame = requestAnimationFrame(draw)
      }
    }

    kick.current = () => {
      const now = performance.now()
      const presence = presenceAt(now)
      if (activeRef.current === lit) return
      lit = activeRef.current
      presenceFrom = presence
      changedAt = now
      // A fresh light starts its waves from the beginning (and time stays small for the shader).
      if (lit && presence <= 0) startedAt = now
      wake(true)
    }

    // Compiled while idle after launch, so the first search does not wait for it.
    const warm = window.setTimeout(ensureRenderer, 1500)
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            measured = false
            wake()
          })
    resizeObserver?.observe(host)
    // Back from the tray: carry on if it was lit. Asleep, draw() simply stops scheduling frames.
    const sleepObserver = new MutationObserver(() => {
      measured = false
      wake()
    })
    sleepObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
    const onLost = (event: Event) => {
      event.preventDefault()
      renderer = null
    }
    const onRestored = () => {
      measured = false
      wake()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    wake()

    return () => {
      window.clearTimeout(warm)
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      sleepObserver.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      renderer?.dispose()
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
