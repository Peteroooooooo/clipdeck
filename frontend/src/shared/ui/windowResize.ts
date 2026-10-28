import { desktopApi } from '../../app/pywebview'

export type ResizeEdge = 'top' | 'bottom'

/**
 * Stretching the panel from `.window-resize-edge` handles (top and bottom edge).
 *
 * Like the window drag, the press is handed to the backend once and the native side follows the
 * pointer until the button is released. The resize cursor stays on the whole page meanwhile, so
 * it does not flicker as the pointer runs ahead of the edge.
 */
export function installWindowResize(target: Document = document) {
  const root = target.documentElement
  const stopResizing = () => root.classList.remove('is-resizing')

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) {
      return
    }
    const handle = event.target.closest<HTMLElement>('.window-resize-edge')
    const edge = handle?.dataset.edge
    if (edge !== 'top' && edge !== 'bottom') {
      return
    }
    event.preventDefault()
    root.classList.add('is-resizing')
    const scale = window.devicePixelRatio || 1
    void desktopApi.beginWindowResize(edge, Math.round(event.clientY * scale)).finally(stopResizing)
  }

  target.addEventListener('mousedown', handleMouseDown)
  target.addEventListener('mouseup', stopResizing)
  return () => {
    target.removeEventListener('mousedown', handleMouseDown)
    target.removeEventListener('mouseup', stopResizing)
    stopResizing()
  }
}
