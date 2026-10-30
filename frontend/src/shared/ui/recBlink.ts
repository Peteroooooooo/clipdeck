import { useEffect, type RefObject } from 'react'

// The recording light's blink: the same ease between 1 and 0.25 over 1.6 s in 16 steps, set by a
// timer ten times a second. As a CSS animation, even a stepped one, it kept the compositor ticking
// at every frame of the screen, and it was the whole cost of an open, idle panel (measured: 4% of
// a core on the renderer and 6% on the GPU process).
const STEPS = [1, 0.971, 0.89, 0.769, 0.625, 0.481, 0.36, 0.279, 0.25, 0.279, 0.36, 0.481, 0.625, 0.769, 0.89, 0.971]
const STEP_MS = 100

/** Blinks `ref` while `blinking`, except asleep in the tray (is-asleep) or with motion off. */
export function useRecBlink(ref: RefObject<HTMLElement | null>, blinking: boolean) {
  useEffect(() => {
    const dot = ref.current
    if (!dot || !blinking) return
    const root = document.documentElement
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let timer = 0
    let step = 0

    const sync = () => {
      const run = !root.classList.contains('is-asleep') && !root.classList.contains('no-motion') && !reduced?.matches
      if (run && !timer) {
        timer = window.setInterval(() => {
          step = (step + 1) % STEPS.length
          dot.style.opacity = String(STEPS[step])
        }, STEP_MS)
      } else if (!run && timer) {
        window.clearInterval(timer)
        timer = 0
        if (!root.classList.contains('is-asleep')) dot.style.opacity = ''
      }
    }

    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    reduced?.addEventListener?.('change', sync)
    sync()
    return () => {
      window.clearInterval(timer)
      observer.disconnect()
      reduced?.removeEventListener?.('change', sync)
      dot.style.opacity = ''
    }
  }, [ref, blinking])
}
