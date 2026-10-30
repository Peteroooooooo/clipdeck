// While the panel is hidden in the tray, WebView2 still treats the page as visible and would keep
// drawing every animation frame for nobody: the backend sends "clipdeck:sleep" when it hides the
// window and "clipdeck:reveal" when it shows it, and html.is-asleep pauses all animations in
// between (index.css). Installed before React, so a sleep sent while the app is still starting up
// is not missed.
//
// The same events drive the summon motion. Asleep, the panel also sits "concealed" (transparent,
// slightly small, html.is-concealed), so the frame WebView2 shows first when the
// window appears is already the start of the reveal, never a flash of the old panel. On a summon
// the backend shows the window with the page and the native glass both invisible and sends
// "clipdeck:prepare". Right after a hidden window is shown, WebView2's frames can take 60-130 ms
// to reach the screen while Windows draws the glass at once, so the page waits until its frames
// flow, then starts its own reveal and calls reveal_started, which fades the glass in with it.
// "clipdeck:reveal" also comes from the backend (fallback, reload after a crash), and
// "clipdeck:conceal" just before a short animated hide.
//
// Each event carries a running number; a late "sleep" can never put a panel that has been shown
// again to sleep.

import { SPRING_SMOOTH_EASING } from './motionTokens'

// Must match CONCEAL_SCALE / REVEAL_MS / CONCEAL_MS in backend/app/backdrop.py.
export const CONCEAL_SCALE = 0.97
export const REVEAL_MS = 260
export const CONCEAL_MS = 130

// Opacity and scale only: a blur filter on the whole panel re-renders every glass surface inside
// it each frame.
const CONCEALED: Keyframe = { opacity: 0, transform: `scale(${CONCEAL_SCALE})` }
const SHOWN: Keyframe = { opacity: 1, transform: 'none' }
const CARD_DELAY_MS = 30
const CARD_STEP_MS = 22
// However tall the panel is stretched, the last on-screen card starts no later than the 8th did.
const CARD_SPREAD_MS = 7 * CARD_STEP_MS
// On a summon the page waits, invisible, until its frames reach the screen steadily: at least
// WAKE_MIN_MS after the window appeared and no frame gap over WAKE_GAP_MS for WAKE_SMOOTH_MS.
// Measured on a 240 Hz screen: the stall (60-130 ms) hit 3 of 12 summons without waiting and none
// of 32 with these values; the reveal starts ~70 ms after the shortcut.
const WAKE_MIN_MS = 40
const WAKE_SMOOTH_MS = 25
const WAKE_GAP_MS = 25

function motionAllowed() {
  return !(
    document.documentElement.classList.contains('no-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function panelElement() {
  return document.querySelector<HTMLElement>('.glass-window')
}

function seqOf(event: Event) {
  return Number((event as CustomEvent<{ seq?: number } | null>).detail?.seq ?? Number.NaN)
}

export function installPanelSleep() {
  const root = document.documentElement
  let latest = -1
  let running: Animation[] = []

  const isCurrent = (event: Event) => {
    const seq = seqOf(event)
    if (Number.isNaN(seq)) return true
    if (seq < latest) return false
    latest = seq
    return true
  }

  const stopRunning = () => {
    running.forEach((animation) => animation.cancel())
    running = []
  }

  // The summon whose reveal has started, so the backend's fallback reveal does not replay it.
  let revealed = -1

  const handlePrepare = (event: Event) => {
    if (!isCurrent(event)) return
    const seq = seqOf(event)
    const panel = panelElement()
    let first = 0
    let last = 0
    let frames = 0
    let smoothSince = 0
    const finish = () => {
      if (panel) panel.style.opacity = ''
    }
    const step = (now: number) => {
      if (latest !== seq || revealed === seq) {
        finish()
        return
      }
      if (!first) first = smoothSince = now
      else if (now - last > WAKE_GAP_MS) smoothSince = now
      last = now
      frames += 1
      if (now - first >= WAKE_MIN_MS && now - smoothSince >= WAKE_SMOOTH_MS) {
        finish()
        window.dispatchEvent(new CustomEvent('clipdeck:reveal', { detail: { seq } }))
        void window.pywebview?.api.reveal_started?.(seq)
        return
      }
      // An invisible change every frame, so frames keep going to the screen while it waits.
      if (panel) panel.style.opacity = frames % 2 ? '0.0024' : '0.002'
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  const handleSleep = (event: Event) => {
    if (!isCurrent(event)) return
    stopRunning()
    root.classList.add('is-asleep', 'is-concealed')
  }

  const handleReveal = (event: Event) => {
    const seq = seqOf(event)
    if (!Number.isNaN(seq) && seq === revealed) return
    if (!isCurrent(event)) return
    if (!Number.isNaN(seq)) revealed = seq
    const panel = panelElement()
    // Start from wherever the panel is now (mid-conceal when summoned again quickly).
    const from: Keyframe = panel ? currentLook(panel) : CONCEALED
    const wasConcealed = root.classList.contains('is-concealed') || running.length > 0
    stopRunning()
    root.classList.remove('is-asleep', 'is-concealed')
    if (!panel || !wasConcealed || !motionAllowed() || typeof panel.animate !== 'function') return

    running.push(panel.animate([from, SHOWN], { duration: REVEAL_MS, easing: SPRING_SMOOTH_EASING }))
    if (from.opacity === 0) {
      const cards = visibleCards(panel)
      const step = cards.length > 1 ? Math.min(CARD_STEP_MS, CARD_SPREAD_MS / (cards.length - 1)) : 0
      cards.forEach((card, index) => {
        running.push(
          card.animate([{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], {
            duration: 300,
            delay: CARD_DELAY_MS + index * step,
            easing: SPRING_SMOOTH_EASING,
            fill: 'backwards',
          }),
        )
      })
    }
    const own = running
    void Promise.allSettled(own.map((animation) => animation.finished)).then(() => {
      if (running === own) running = []
    })
  }

  const handleConceal = (event: Event) => {
    if (!isCurrent(event)) return
    const panel = panelElement()
    const from: Keyframe = panel ? currentLook(panel) : SHOWN
    stopRunning()
    if (!panel || !motionAllowed() || typeof panel.animate !== 'function') {
      root.classList.add('is-concealed')
      return
    }
    const animation = panel.animate([from, CONCEALED], {
      duration: CONCEAL_MS,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'forwards',
    })
    running = [animation]
    void animation.finished.then(
      () => {
        if (running[0] !== animation) return
        root.classList.add('is-concealed')
        animation.cancel()
        running = []
      },
      () => undefined,
    )
  }

  window.addEventListener('clipdeck:sleep', handleSleep)
  window.addEventListener('clipdeck:prepare', handlePrepare)
  window.addEventListener('clipdeck:reveal', handleReveal)
  window.addEventListener('clipdeck:conceal', handleConceal)
  return () => {
    stopRunning()
    window.removeEventListener('clipdeck:sleep', handleSleep)
    window.removeEventListener('clipdeck:prepare', handlePrepare)
    window.removeEventListener('clipdeck:reveal', handleReveal)
    window.removeEventListener('clipdeck:conceal', handleConceal)
  }
}

/** The cards inside the list's visible area, top to bottom (the panel can be stretched to any height). */
function visibleCards(panel: HTMLElement) {
  const cards = Array.from(panel.querySelectorAll<HTMLElement>('.panel-card'))
  const view = panel.querySelector<HTMLElement>('.panel-scroll')?.getBoundingClientRect()
  if (!view) return cards.slice(0, 8)
  return cards.filter((card) => {
    const box = card.getBoundingClientRect()
    return box.bottom > view.top && box.top < view.bottom
  })
}

/** The panel's look right now, including any running animation. */
function currentLook(panel: HTMLElement): Keyframe {
  if (document.documentElement.classList.contains('is-concealed')) return CONCEALED
  const style = getComputedStyle(panel)
  const opacity = Number.parseFloat(style.opacity)
  return {
    opacity: Number.isNaN(opacity) ? 1 : opacity,
    transform: style.transform && style.transform !== 'none' ? style.transform : 'none',
  }
}
