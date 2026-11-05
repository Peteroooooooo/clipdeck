import { useEffect, useRef } from 'react'

// The bar widens once the pointer comes this close to the list's right edge…
const NEAR_PX = 36
// …and a press this close to the edge takes hold of it (the list's right padding, so no row loses
// a click to it).
const GRAB_PX = 20
const MIN_THUMB_PX = 32
// The thumb's gap to the ends of the list, as the native bar had.
const END_INSET_PX = 4

/**
 * The list's scrollbar, drawn by the page: thin while the pointer is elsewhere, wider as it comes
 * near, and easy to grab. The native bar could do neither without a fixed wider gutter.
 *
 * The bar itself takes no pointer events, so the wheel and everything else still go to the list;
 * presses near the list's right edge are picked up on the list. Put it next to the scroller, in
 * a positioned box of the scroller's size (.scroll-area); the scroller gets `data-scrollable`
 * while its content overflows, for its gutter padding.
 */
export function OverlayScrollbar({ scroller }: { scroller: HTMLElement | null }) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const bar = barRef.current
    const thumb = thumbRef.current
    if (!scroller || !bar || !thumb) return

    let range = 0
    let travel = 0
    let drag: { pointerId: number; grab: number } | null = null
    let gutterFrame = 0

    const flag = (element: HTMLElement, name: string, on: boolean) => {
      if (on) element.dataset[name] = ''
      else delete element.dataset[name]
    }

    // A frame later, not from inside the ResizeObserver callback: the padding it changes resizes
    // the very elements being observed.
    const setGutter = (on: boolean) => {
      cancelAnimationFrame(gutterFrame)
      if (('scrollable' in scroller.dataset) !== on) {
        gutterFrame = requestAnimationFrame(() => flag(scroller, 'scrollable', on))
      }
    }

    const place = () => {
      const y = range > 0 ? (scroller.scrollTop / range) * travel : 0
      thumb.style.transform = `translateY(${y.toFixed(2)}px)`
    }

    const measure = () => {
      const view = scroller.clientHeight
      const content = scroller.scrollHeight
      range = Math.max(0, content - view)
      const scrollable = range > 1
      setGutter(scrollable)
      flag(bar, 'scrollable', scrollable)
      const track = Math.max(0, view - END_INSET_PX * 2)
      const size = scrollable ? Math.min(track, Math.max(MIN_THUMB_PX, (track * view) / content)) : 0
      travel = track - size
      thumb.style.height = `${size}px`
      place()
    }

    // Page units, also while the whole panel is scaled (its reveal).
    const scaleOf = (box: DOMRect) => (scroller.offsetHeight ? box.height / scroller.offsetHeight : 1) || 1
    const fromEdge = (event: PointerEvent) => scroller.getBoundingClientRect().right - event.clientX
    const isNear = (event: PointerEvent) => {
      const box = scroller.getBoundingClientRect()
      const distance = box.right - event.clientX
      return range > 1 && distance >= 0 && distance <= NEAR_PX && event.clientY >= box.top && event.clientY <= box.bottom
    }

    const follow = (event: PointerEvent) => {
      if (!drag) return
      const box = scroller.getBoundingClientRect()
      const y = (event.clientY - box.top) / scaleOf(box) - END_INSET_PX - drag.grab
      scroller.scrollTop = travel > 0 ? (Math.min(travel, Math.max(0, y)) / travel) * range : 0
    }

    const handleMove = (event: PointerEvent) => {
      if (drag) {
        follow(event)
        return
      }
      const near = isNear(event)
      if (near && !('near' in bar.dataset)) measure()
      flag(bar, 'near', near)
    }

    const handleDown = (event: PointerEvent) => {
      if (event.button !== 0 || range <= 1) return
      const distance = fromEdge(event)
      if (distance < 0 || distance > GRAB_PX) return
      event.preventDefault()
      measure()
      const box = scroller.getBoundingClientRect()
      const scale = scaleOf(box)
      const thumbBox = thumb.getBoundingClientRect()
      const onThumb = event.clientY >= thumbBox.top && event.clientY <= thumbBox.bottom
      // Pressed beside the thumb: it jumps under the pointer and is held by its middle.
      drag = {
        pointerId: event.pointerId,
        grab: onThumb ? (event.clientY - thumbBox.top) / scale : thumbBox.height / scale / 2,
      }
      scroller.setPointerCapture?.(event.pointerId)
      flag(bar, 'dragging', true)
      flag(bar, 'near', true)
      if (!onThumb) follow(event)
    }

    const handleUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      drag = null
      if (scroller.hasPointerCapture?.(event.pointerId)) scroller.releasePointerCapture(event.pointerId)
      flag(bar, 'dragging', false)
      flag(bar, 'near', isNear(event))
    }

    const handleLeave = () => {
      if (!drag) flag(bar, 'near', false)
    }

    // The content's height changes as clips come and go; the list's own as the panel is stretched.
    // Its children are swapped too (switching filters, settings pages), so they are re-observed.
    // Rows moving on a layout animation stretch scrollHeight for a moment without resizing
    // anything, so it is read again on every scroll, on approach and when a drag starts.
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    const observeChildren = () => {
      if (!resizes) return
      resizes.disconnect()
      resizes.observe(scroller)
      for (const child of Array.from(scroller.children)) resizes.observe(child)
    }
    const mutations =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            observeChildren()
            measure()
          })
    observeChildren()
    mutations?.observe(scroller, { childList: true })
    measure()

    scroller.addEventListener('scroll', measure, { passive: true })
    scroller.addEventListener('pointermove', handleMove)
    scroller.addEventListener('pointerdown', handleDown)
    scroller.addEventListener('pointerup', handleUp)
    scroller.addEventListener('pointercancel', handleUp)
    scroller.addEventListener('lostpointercapture', handleUp)
    scroller.addEventListener('pointerleave', handleLeave)
    return () => {
      cancelAnimationFrame(gutterFrame)
      resizes?.disconnect()
      mutations?.disconnect()
      scroller.removeEventListener('scroll', measure)
      scroller.removeEventListener('pointermove', handleMove)
      scroller.removeEventListener('pointerdown', handleDown)
      scroller.removeEventListener('pointerup', handleUp)
      scroller.removeEventListener('pointercancel', handleUp)
      scroller.removeEventListener('lostpointercapture', handleUp)
      scroller.removeEventListener('pointerleave', handleLeave)
      delete scroller.dataset.scrollable
      for (const name of ['scrollable', 'near', 'dragging']) delete bar.dataset[name]
    }
  }, [scroller])

  return (
    <div aria-hidden="true" className="overlay-scrollbar" ref={barRef}>
      <div className="overlay-scrollbar-thumb" ref={thumbRef} />
    </div>
  )
}
