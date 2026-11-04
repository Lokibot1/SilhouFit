import { beforeEach, describe, expect, it } from 'vitest'
import { close, expand, getDock, minimizeAll, openChat, reset } from '../../src/service/chatDock'

const ids = () => getDock().boxes.map((box) => `${box.id}:${box.mode}`)

beforeEach(reset)

describe('chat dock store', () => {
  it('keeps only one box open: opening or expanding minimizes the others', () => {
    openChat('a', { name: 'A' })
    openChat('b', { name: 'B' })
    expect(ids()).toEqual(['a:min', 'b:open'])
    expand('a')
    expect(ids()).toEqual(['a:open', 'b:min'])
  })

  it('opening a box that already exists reuses it instead of adding another', () => {
    openChat('a', { name: 'A' })
    openChat('b', { name: 'B' })
    openChat('a', { name: 'A' })
    expect(getDock().boxes).toHaveLength(2)
    expect(ids().filter((box) => box.endsWith(':open'))).toEqual(['a:open'])
  })

  it('minimizeAll turns the open box into a head and closes none', () => {
    openChat('a', { name: 'A' })
    minimizeAll()
    expect(ids()).toEqual(['a:min'])
  })

  it('close removes one box', () => {
    openChat('a', { name: 'A' })
    openChat('b', { name: 'B' })
    close('a')
    expect(ids()).toEqual(['b:open'])
  })

  it('holds at most 4 boxes, dropping the oldest head for a fifth', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) openChat(id, { name: id })
    expect(ids()).toEqual(['b:min', 'c:min', 'd:min', 'e:open'])
  })

  it('reset empties the dock', () => {
    openChat('a', { name: 'A' })
    reset()
    expect(getDock().boxes).toEqual([])
  })
})
