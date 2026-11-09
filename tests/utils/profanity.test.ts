import { describe, expect, it } from 'vitest'
import { hasProfanity, maskProfanity, PROFANITY_ERROR } from '../../src/utils/profanity'

const MUST_BLOCK = [
  'fcuk', 'fck', 'fuk', 'fuq', 'fcuking', 'fuking', 'fcuker', 'dicc', 'dikk', 'puke', 'pukee', '3o3o', 'b0b0', 'bobo', 'oten', 'otin', 'utin', 'uten', 'borat', 'burat', 'bilet', 'bilat', 'tite', 'titi',
  'fuck', 'fuck you', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'bastard', 'motherfucker',
  'nigger', 'faggot', 'retard',
  'sh1t', 'fvck', 'f*ck', 'fuuuuuck', 'shiiit',
  'f u c k', 'f.u.c.k', 'a s s h o l e', 's h i t',
  'gago', 'g4go', 'gagu', 'tangina', 't4ngina', 'tanginamo', 'putang ina mo', 'putangina', 'puta', 'ulol', 'tarantado',
  'yawa ka', 'pisting yawa', 'pisti', 'bilat', 'kantot', 'kupal', 'hayop ka', 'buang',
  'papatayin kita', 'patayin kita', 'ipapapatay', 'bubugbugin kita', 'patyon tika', 'ipatay tika', 'kill you', 'kill u', 'I will kill you',
]

const MUST_PASS = [
  'fuse', 'full', 'fun', 'dice', 'dig', 'dime', 'often', 'soften', 'button', 'butter', 'rotten', 'bore', 'borate', 'pure', 'fluke', 'duke', 'luke', 'tutor', 'utang', 'bilis',
  'assistant', 'class', 'classic', 'glass', 'bogo', 'buy one get one', 'taehyung', 'Scunthorpe', 'Essex', 'Dickson',
  'cockpit', 'grape', 'title', 'kitchen', 'therapist', 'Cassandra', 'assess', 'bass', 'hello', 'basement', 'shiitake',
  'analysis', 'Penistone',
  'salamat po', 'magkano po ito', 'available pa ba', 'size medium', 'saan ang tindahan niyo', 'unsa ang presyo', 'palihug',
  'naa pa ba', 'gwapa', 'hayop sa ganda', 'tae in taehyung',
  'kill the lag', 'killer fit', 'this dress kills it', 'to kill time',
  'I a m here', 'u r a g r e a t', 'computation', 'reputation', 'Putatan', 'Bilar', 'Paete', 'Pitogo', 'Titay',
]

describe('hasProfanity', () => {
  it.each(MUST_BLOCK)('blocks "%s"', (text) => {
    expect(hasProfanity(text)).toBe(true)
  })

  it.each(MUST_PASS)('allows "%s"', (text) => {
    expect(hasProfanity(text)).toBe(false)
  })

  it('shares one generic error that does not echo the word', () => {
    expect(PROFANITY_ERROR).toMatch(/isn't allowed/)
  })
})

describe('maskProfanity', () => {
  it('replaces the word with asterisks of the same length and keeps the rest', () => {
    const { text, offended } = maskProfanity('you are a bitch')
    expect(text).toBe('you are a *****')
    expect(offended).toBe(true)
  })

  it('masks several words and Filipino words', () => {
    const { text } = maskProfanity('fuck this shit, gago')
    expect(text).toBe('**** this ****, ****')
  })

  it('masks a spaced-out word as a whole run and keeps the length', () => {
    const input = 'you f u c k'
    const { text, offended } = maskProfanity(input)
    expect(text).toBe('you * * * *')
    expect(text).toHaveLength(input.length)
    expect(offended).toBe(true)
  })

  it('leaves clean text untouched', () => {
    for (const clean of ['hello, is this in size medium?', 'Dickson at the cockpit', 'I a m here', 'kill the lag']) {
      expect(maskProfanity(clean)).toEqual({ text: clean, offended: false })
    }
  })

  it('never keeps a word it would flag', () => {
    const { text } = maskProfanity('f*ck, fuuuuuck and tangina')
    expect(hasProfanity(text)).toBe(false)
    expect(text).toHaveLength('f*ck, fuuuuuck and tangina'.length)
  })
})
