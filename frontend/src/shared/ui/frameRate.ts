// The continuous effects (search glow, row meteor) run at half the screen's refresh rate from
// 120 Hz up and at full rate below: 60 Hz → 60, 90 Hz → 90, 144 Hz → 72, 240 Hz → 120. Each frame
// the window draws costs a full composite of its glass, and every other frame of a fast screen
// looks the same for these slow movements. Half is always whole frames, so the cadence stays even.
//
// The rate is measured from animation frames at launch and again on every summon, as the panel
// may have moved to another screen.

/** Seconds for the meteor's lap; must match row-meteor in index.css. */
const METEOR_LAP_S = 3.6
const SAMPLE_FRAMES = 60
const COMMON_RATES = [60, 75, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 300, 360, 480, 500]

/** The common refresh rate within 3% of a measured one (59.94 → 60, 238.7 → 240). */
function nominal(rate: number) {
  const near = COMMON_RATES.find((common) => Math.abs(rate - common) <= common * 0.03)
  return near ?? Math.round(rate)
}

let divisor = 1
let measuring = false
const listeners = new Set<(divisor: number) => void>()

/** 2 to draw every other frame, 1 to draw every frame. */
export function frameDivisor() {
  return divisor
}

export function onFrameDivisor(listener: (divisor: number) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function apply(rate: number) {
  const next = rate >= 110 ? 2 : 1
  // The meteor is a CSS animation: it gets one step per drawn frame, or runs smooth at full rate.
  document.documentElement.style.setProperty(
    '--meteor-timing',
    next === 1 ? 'linear' : `steps(${Math.round((METEOR_LAP_S * rate) / next)})`,
  )
  if (next === divisor) return
  divisor = next
  listeners.forEach((listener) => listener(next))
}

function measure() {
  if (measuring || typeof requestAnimationFrame !== 'function') return
  measuring = true
  const gaps: number[] = []
  let last = 0
  const step = (now: number) => {
    if (last) gaps.push(now - last)
    last = now
    if (gaps.length < SAMPLE_FRAMES) {
      requestAnimationFrame(step)
      return
    }
    measuring = false
    // Around the median, so a frame dropped while the page is busy does not count; averaged, and
    // then snapped to the screen's nominal rate, since a meteor step count off by even two
    // (430 for 432) would slip against the frames and hitch about once a second.
    gaps.sort((a, b) => a - b)
    const median = gaps[gaps.length >> 1]
    const steady = gaps.filter((gap) => Math.abs(gap - median) < median * 0.25)
    const gap = steady.reduce((sum, value) => sum + value, 0) / steady.length
    if (gap > 0) apply(nominal(1000 / gap))
  }
  requestAnimationFrame(step)
}

export function installFrameRate() {
  measure()
  window.addEventListener('clipdeck:reveal', measure)
}
