/**
 * Desktop glass backdrop.
 *
 * The native window is fully transparent, so the backend sends a pre-blurred snapshot of the
 * monitor behind it (`clipdeck:backdrop`) and the window position on every move
 * (`clipdeck:moved`). Both arrive in physical pixels; this module turns them into CSS
 * variables that `.glass-backdrop` uses to line the snapshot up with the real desktop.
 */

interface BackdropDetail {
  url: string
  left: number
  top: number
  width: number
  height: number
  windowLeft: number
  windowTop: number
}

type MovedDetail = Pick<BackdropDetail, 'windowLeft' | 'windowTop'>

let current: BackdropDetail | null = null
let windowEl: HTMLElement | null = null
let activeAnimation: Animation | null = null

function backdropTarget(root: HTMLElement) {
  if (windowEl && windowEl.isConnected) {
    return windowEl
  }
  windowEl = document.querySelector<HTMLElement>('.glass-window')
  return windowEl ?? root
}

function applyPosition(target: HTMLElement) {
  if (!current) {
    return
  }
  const dpr = window.devicePixelRatio || 1
  const x = (current.left - current.windowLeft) / dpr
  const y = (current.top - current.windowTop) / dpr
  target.style.setProperty('--backdrop-x', `calc(${x}px - var(--shell-pad))`)
  target.style.setProperty('--backdrop-y', `calc(${y}px - var(--shell-pad))`)
  target.style.setProperty('--backdrop-w', `${current.width / dpr}px`)
  target.style.setProperty('--backdrop-h', `${current.height / dpr}px`)
}

function clearPrev(target: HTMLElement) {
  target.style.removeProperty('--backdrop-prev')
}

function fadeIn(element: HTMLElement | null, target: HTMLElement) {
  if (activeAnimation) {
    activeAnimation.cancel()
    activeAnimation = null
  }
  if (
    !element ||
    typeof element.animate !== 'function' ||
    document.documentElement.classList.contains('no-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    clearPrev(target)
    return
  }
  const anim = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
  activeAnimation = anim
  const done = () => {
    if (activeAnimation === anim) {
      activeAnimation = null
      clearPrev(target)
    }
  }
  if (anim.finished && typeof anim.finished.then === 'function') {
    anim.finished.then(done, () => {
      if (activeAnimation === anim) {
        activeAnimation = null
      }
    })
  } else {
    anim.onfinish = done
  }
}

export function installDesktopBackdrop(root: HTMLElement = document.documentElement) {
  const handleBackdrop = (event: Event) => {
    const detail = (event as CustomEvent<BackdropDetail>).detail
    if (!detail?.url) {
      return
    }
    const target = backdropTarget(root)
    // Keep the previous snapshot underneath and fade the new one in, so the glass never
    // flashes back to the plain fallback colour.
    const previous = target.style.getPropertyValue('--backdrop-image')
    target.style.setProperty('--backdrop-prev', previous || 'none')
    current = detail
    target.style.setProperty('--backdrop-image', `url("${detail.url}")`)
    applyPosition(target)
    root.classList.add('has-backdrop')
    fadeIn(document.querySelector<HTMLElement>('.glass-backdrop'), target)
  }

  const handleMoved = (event: Event) => {
    const detail = (event as CustomEvent<MovedDetail>).detail
    if (!current || !detail) {
      return
    }
    current = { ...current, ...detail }
    applyPosition(backdropTarget(root))
  }

  // "live": the Windows compositor blurs the desktop under the page in real time, so the page
  // only adds its tint. "snapshot": the page paints the frosted snapshot itself.
  const handleGlass = (event: Event) => {
    const detail = (event as CustomEvent<{ mode: string }>).detail
    root.classList.toggle('glass-live', detail?.mode === 'live')
  }

  window.addEventListener('clipdeck:backdrop', handleBackdrop)
  window.addEventListener('clipdeck:moved', handleMoved)
  window.addEventListener('clipdeck:glass', handleGlass)
  return () => {
    activeAnimation?.cancel()
    activeAnimation = null
    windowEl = null
    current = null
    window.removeEventListener('clipdeck:backdrop', handleBackdrop)
    window.removeEventListener('clipdeck:moved', handleMoved)
    window.removeEventListener('clipdeck:glass', handleGlass)
  }
}
