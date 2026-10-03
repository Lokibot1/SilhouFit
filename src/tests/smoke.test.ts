import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('runs in a jsdom environment', () => {
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement)
  })
})
