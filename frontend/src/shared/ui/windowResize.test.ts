import { afterEach, describe, expect, test, vi } from 'vitest'
import { desktopApi } from '../../app/pywebview'
import { installWindowResize } from './windowResize'

describe('window resize', () => {
  let uninstall: (() => void) | null = null

  afterEach(() => {
    uninstall?.()
    uninstall = null
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  test('hands a press on an edge handle to the backend in physical pixels', async () => {
    let finish: () => void = () => {}
    const begin = vi
      .spyOn(desktopApi, 'beginWindowResize')
      .mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1.5)
    document.body.innerHTML = '<div class="window-resize-edge" data-edge="bottom"></div>'
    uninstall = installWindowResize()

    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 669 })
    document.querySelector('.window-resize-edge')!.dispatchEvent(press)

    expect(begin).toHaveBeenCalledWith('bottom', 1004)
    expect(press.defaultPrevented).toBe(true)
    expect(document.documentElement.classList.contains('is-resizing')).toBe(true)

    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(document.documentElement.classList.contains('is-resizing')).toBe(false)
  })

  test('ignores other buttons and presses away from the edges', () => {
    const begin = vi.spyOn(desktopApi, 'beginWindowResize').mockResolvedValue(undefined)
    document.body.innerHTML = '<div class="window-resize-edge" data-edge="top"></div><button>Other</button>'
    uninstall = installWindowResize()

    document.querySelector('.window-resize-edge')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }))
    document.querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))

    expect(begin).not.toHaveBeenCalled()
  })
})
