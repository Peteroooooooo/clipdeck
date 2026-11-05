import { useState } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OverlayScrollbar } from './OverlayScrollbar'

// jsdom lays nothing out: the list is given a 300 x 200 box with 800px of content.
function stubLayout(element: HTMLElement) {
  let scrollTop = 0
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => 200 },
    scrollHeight: { configurable: true, get: () => 800 },
    offsetHeight: { configurable: true, get: () => 200 },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value
      },
    },
  })
  element.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)
}

function Harness() {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  return (
    <div className="scroll-area">
      <div
        className="panel-scroll"
        ref={(element) => {
          if (element && element !== scroller) {
            stubLayout(element)
            setScroller(element)
          }
        }}
      />
      <OverlayScrollbar scroller={scroller} />
    </div>
  )
}

const Pointer = (typeof PointerEvent === 'undefined' ? MouseEvent : PointerEvent) as typeof MouseEvent

function pointer(target: Element, type: string, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(new Pointer(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY }))
  })
}

function setup() {
  const { container } = render(<Harness />)
  const scroller = container.querySelector<HTMLElement>('.panel-scroll')!
  const bar = container.querySelector<HTMLElement>('.overlay-scrollbar')!
  const thumb = container.querySelector<HTMLElement>('.overlay-scrollbar-thumb')!
  return { scroller, bar, thumb }
}

describe('OverlayScrollbar', () => {
  test('sizes and places the thumb from how far the list is scrolled', async () => {
    const { scroller, bar, thumb } = setup()

    // Track 200 - 2 x 4 = 192px; the thumb shows a quarter of it, 48px, and travels 144px.
    expect(bar).toHaveAttribute('data-scrollable')
    expect(thumb.style.height).toBe('48px')
    await waitFor(() => expect(scroller).toHaveAttribute('data-scrollable'))

    act(() => {
      scroller.scrollTop = 300
      scroller.dispatchEvent(new Event('scroll'))
    })

    expect(thumb.style.transform).toBe('translateY(72.00px)')
  })

  test('widens only while the pointer is near the right edge', () => {
    const { scroller, bar } = setup()

    pointer(scroller, 'pointermove', 120, 100)
    expect(bar).not.toHaveAttribute('data-near')

    pointer(scroller, 'pointermove', 280, 100)
    expect(bar).toHaveAttribute('data-near')

    pointer(scroller, 'pointermove', 200, 100)
    expect(bar).not.toHaveAttribute('data-near')
  })

  test('a press by the edge takes hold of the bar and dragging scrolls the list', () => {
    const { scroller, bar } = setup()

    // Beside the thumb: it jumps under the pointer, here to the middle of its travel.
    pointer(scroller, 'pointerdown', 292, 76)
    expect(bar).toHaveAttribute('data-dragging')
    expect(scroller.scrollTop).toBe(300)

    pointer(scroller, 'pointermove', 150, 148)
    expect(scroller.scrollTop).toBe(600)

    pointer(scroller, 'pointerup', 150, 148)
    expect(bar).not.toHaveAttribute('data-dragging')
    expect(bar).not.toHaveAttribute('data-near')
  })

  test('presses on the rows are left alone', () => {
    const { scroller, bar } = setup()

    pointer(scroller, 'pointerdown', 200, 76)

    expect(bar).not.toHaveAttribute('data-dragging')
    expect(scroller.scrollTop).toBe(0)
  })
})
