import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as service from '../../src/service/helpAnswers'
import { validateHelpAnswer } from '../../src/utils/helpAnswerValidation'

const NOW = { delayMs: 0 }
const input = (over: Partial<service.HelpAnswerInput> = {}): service.HelpAnswerInput => ({
  question: 'Do you gift wrap orders?',
  answer: 'Gift wrapping is not offered yet.',
  keywords: ['gift'],
  category: 'orders',
  link: null,
  published: true,
  ...over,
})
const ids = () => service.getHelpAnswers().map((a) => a.id)

beforeEach(() => {
  localStorage.clear()
  service.setHelpAnswers(service.getHelpAnswers().slice(0, 4))
})

describe('seed answers', () => {
  it('pass the same rules an admin has to meet', () => {
    vi.resetModules()
    localStorage.clear()
    return import('../../src/service/helpAnswers').then((fresh) => {
      const seeds = fresh.getHelpAnswers()
      expect(seeds.length).toBeGreaterThanOrEqual(15)
      for (const a of seeds) {
        const errors = validateHelpAnswer({ ...a, keywords: a.keywords.join(','), linkTo: a.link?.to ?? '', linkLabel: a.link?.label ?? '' })
        expect(errors, a.question).toEqual({})
      }
    })
  })
})

describe('listPublicAnswers', () => {
  it('leaves out drafts and shows only the fields the chatbot needs', async () => {
    const [first, second, ...rest] = service.getHelpAnswers()
    service.setHelpAnswers([first, { ...second, published: false }, ...rest])
    const shown = await service.listPublicAnswers(NOW)
    expect(shown.map((a) => a.id)).not.toContain(second.id)
    expect(shown).toHaveLength(service.getHelpAnswers().length - 1)
    expect(Object.keys(shown[0]).sort()).toEqual(['answer', 'category', 'id', 'keywords', 'link', 'question'])
  })
})

describe('saving', () => {
  it('adds a new answer last and numbers the list again', async () => {
    const created = await service.createHelpAnswer(input(), 'Dev Admin', NOW)
    expect(ids().at(-1)).toBe(created.id)
    expect(service.getHelpAnswers().map((a) => a.order)).toEqual([1, 2, 3, 4, 5])
  })

  it('checks the rules again on save and names the field', async () => {
    await expect(service.createHelpAnswer(input({ answer: 'Mail us at help@kral.ph today.' }), 'Dev Admin', NOW)).rejects.toMatchObject({ kind: 'validation', field: 'answer' })
  })

  it('publishes a draft', async () => {
    const created = await service.createHelpAnswer(input({ published: false }), 'Dev Admin', NOW)
    expect((await service.listPublicAnswers(NOW)).some((a) => a.id === created.id)).toBe(false)
    await service.updateHelpAnswer(created.id, input({ published: true }), 'Dev Admin', NOW)
    expect((await service.listPublicAnswers(NOW)).some((a) => a.id === created.id)).toBe(true)
  })

  it('deletes an answer', async () => {
    const [first] = ids()
    await service.deleteHelpAnswer(first, NOW)
    expect(ids()).not.toContain(first)
  })
})

describe('moveHelpAnswer', () => {
  it('moves one place and reports the new position', async () => {
    const [a, b] = ids()
    expect(await service.moveHelpAnswer(a, 'down', NOW)).toBe(2)
    expect(ids().slice(0, 2)).toEqual([b, a])
  })

  it('does nothing at either end', async () => {
    const before = ids()
    expect(await service.moveHelpAnswer(before[0], 'up', NOW)).toBe(1)
    expect(await service.moveHelpAnswer(before.at(-1)!, 'down', NOW)).toBe(before.length)
    expect(ids()).toEqual(before)
  })
})

describe('persistence', () => {
  it('survives a reload', async () => {
    const created = await service.createHelpAnswer(input(), 'Dev Admin', NOW)
    vi.resetModules()
    const fresh = await import('../../src/service/helpAnswers')
    expect(fresh.getHelpAnswers().map((a) => a.id)).toContain(created.id)
  })

  it('loads again when another tab changes the answers', () => {
    const seen = vi.fn()
    const stop = service.subscribeHelpAnswers(seen)
    localStorage.setItem(service.HELP_ANSWERS_KEY, JSON.stringify(service.getHelpAnswers().slice(0, 2)))
    window.dispatchEvent(new StorageEvent('storage', { key: service.HELP_ANSWERS_KEY }))
    expect(service.getHelpAnswers()).toHaveLength(2)
    expect(seen).toHaveBeenCalled()
    stop()
  })
})
