import { describe, expect, it } from 'vitest'
import { computePlace } from '../../src/components/ui/listbox'

// A button as the press feedback leaves it: scaled about its centre while it springs back.
function button(box: { left: number; top: number; width: number; height: number }, offset: { width: number; height: number }) {
  return {
    offsetWidth: offset.width,
    offsetHeight: offset.height,
    getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }),
  } as unknown as HTMLElement
}

describe('computePlace', () => {
  it('lines the list up with the button, even while the press feedback has it scaled to 95%', () => {
    window.innerWidth = 1280
    window.innerHeight = 900
    const rest = computePlace(button({ left: 865, top: 200, width: 382, height: 44 }, { width: 382, height: 44 }), 382)
    // 0.95 about the centre: 9.55px in from each side, 1.1px in from the top and bottom.
    const pressed = computePlace(button({ left: 874.55, top: 201.1, width: 362.9, height: 41.8 }, { width: 382, height: 44 }), 382)
    expect(pressed.left).toBeCloseTo(rest.left, 1)
    expect(pressed.top).toBeCloseTo(rest.top as number, 1)
  })
})
