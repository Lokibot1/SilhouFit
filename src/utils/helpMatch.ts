import type { PublicHelpAnswer } from '../service/helpAnswers'

// shortcut: no typo tolerance, upgrade if no-match logs show misspellings.
const STOPWORDS = new Set(
  'a an the i me my we our you your it its is am are be do does did can could will would should have has how what when where why which who to of in on at by for from with and or if this that there any about get please hi hello help'.split(' '),
)

// Words people use for what an answer calls something else. Both sides are stemmed below.
const SYNONYM_PAIRS: [string, string][] = [
  ['refund', 'return'],
  ['deliver', 'ship'],
  ['delivery', 'ship'],
  ['pay', 'payment'],
  ['paid', 'payment'],
  ['cost', 'price'],
  ['buy', 'order'],
  ['purchase', 'order'],
]

/** Plain endings only: "returns", "returned", "sizing", "sizes" and "size" all meet at the same stem. */
function stem(word: string): string {
  let w = word
  if (w.length > 4) {
    if (w.endsWith('ing')) w = w.slice(0, -3)
    else if (w.endsWith('ies')) w = `${w.slice(0, -3)}y`
    else if (w.endsWith('ed')) w = w.slice(0, -2)
    else if (w.endsWith('es')) w = w.slice(0, -2)
    else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
    if (/([^aeiou])\1$/.test(w) && !w.endsWith('ss')) w = w.slice(0, -1)
  }
  return w.length > 3 && w.endsWith('e') ? w.slice(0, -1) : w
}

const SYNONYMS = new Map(SYNONYM_PAIRS.map(([from, to]) => [stem(from), stem(to)]))

/** The distinct meaningful words of a text: lower case, no accents or punctuation, no filler words. */
function wordsOf(text: string): Set<string> {
  const plain = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
  const words = plain
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => stem(w))
  return new Set(words.map((w) => SYNONYMS.get(w) ?? w))
}

const KEYWORD = 3
const QUESTION = 2
const ANSWER = 1

export interface Match {
  /** The one answer to show, or null when nothing is clearly right. */
  best: PublicHelpAnswer | null
  /** For a clear match, other answers worth offering; otherwise the answers it could be ("Did you mean"). At most 3. */
  related: PublicHelpAnswer[]
}

/** Scores each distinct word of the query: 3 in an answer's keywords, 2 in its question, 1 in its text. Ties and weak scores never pick an answer. */
export function matchAnswers(query: string, answers: PublicHelpAnswer[]): Match {
  const words = wordsOf(query)
  if (words.size === 0) return { best: null, related: [] }

  const scored = answers
    .map((answer) => {
      const keywords = wordsOf(answer.keywords.join(' '))
      const question = wordsOf(answer.question)
      const text = wordsOf(answer.answer)
      let score = 0
      for (const w of words) score += keywords.has(w) ? KEYWORD : question.has(w) ? QUESTION : text.has(w) ? ANSWER : 0
      return { answer, score }
    })
    .filter((entry) => entry.score > 0)
    // Array sort is stable, so equal scores keep the order the admin set.
    .sort((a, b) => b.score - a.score)

  const [first, second] = scored
  if (!first || first.score < KEYWORD) return { best: null, related: [] }
  if (second && first.score - second.score < 1) {
    return { best: null, related: scored.filter((entry) => entry.score === first.score).slice(0, 3).map((entry) => entry.answer) }
  }
  return { best: first.answer, related: scored.slice(1).filter((entry) => entry.score >= QUESTION).slice(0, 3).map((entry) => entry.answer) }
}
