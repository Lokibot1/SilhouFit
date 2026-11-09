import { DataSet, englishDataset, englishRecommendedTransformers, pattern, RegExpMatcher } from 'obscenity'

// English comes from the obscenity dataset (curse words, sexual terms and slurs, with leetspeak, repeated letters and look-alike
// characters handled). Filipino terms are added on top because the store's customers write in Tagalog and Taglish.
// `|` anchors a pattern to a word boundary, so "gago" does not flag a longer unrelated word.
const words = new DataSet<{ originalWord: string }>()
  .addAll(englishDataset)
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'gago' }).addPattern(pattern`|gago|`).addPattern(pattern`|gaga|`).addPattern(pattern`|gagu|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'tangina' }).addPattern(pattern`|tangina`).addPattern(pattern`|tang ina`).addPattern(pattern`putang ina`).addPattern(pattern`putangina`).addPattern(pattern`|tanginamo`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'puta' }).addPattern(pattern`|puta|`).addPattern(pattern`|putang`).addPattern(pattern`|pota|`).addPattern(pattern`|potang`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'ulol' }).addPattern(pattern`|ulol|`).addPattern(pattern`|olol|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'tarantado' }).addPattern(pattern`|tarantado`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'bobo' }).addPattern(pattern`|bobo|`).addPattern(pattern`|tanga|`).addPattern(pattern`|inutil|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'pakyu' }).addPattern(pattern`|pakyu`).addPattern(pattern`|pak yu`).addPattern(pattern`|pakshet`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'leche' }).addPattern(pattern`|leche|`).addPattern(pattern`|lintik|`).addPattern(pattern`|hayop ka`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'bwisit' }).addPattern(pattern`|bwisit|`).addPattern(pattern`|buwisit|`).addPattern(pattern`|punyeta`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'kantot' }).addPattern(pattern`|kantot`).addPattern(pattern`|hindot`).addPattern(pattern`|jakol`).addPattern(pattern`|iyot`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'pokpok' }).addPattern(pattern`|pokpok`).addPattern(pattern`|burat|`).addPattern(pattern`|pekpek`).addPattern(pattern`|tite|`).addPattern(pattern`|titi|`))
  // More Tagalog.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'siraulo' }).addPattern(pattern`|siraulo|`).addPattern(pattern`|sira ulo|`).addPattern(pattern`|kupal|`).addPattern(pattern`|ungas|`).addPattern(pattern`|gunggong|`).addPattern(pattern`|shunga|`).addPattern(pattern`|engot|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'hinayupak' }).addPattern(pattern`|hinayupak`).addPattern(pattern`|animal ka`).addPattern(pattern`|walang hiya`).addPattern(pattern`|walanghiya`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'ina mo' }).addPattern(pattern`|ina mo`).addPattern(pattern`|inamo`).addPattern(pattern`|pukinang`).addPattern(pattern`|puking ina`).addPattern(pattern`|puki|`).addPattern(pattern`|bayag|`).addPattern(pattern`|etits|`))
  // Bisaya (Cebuano).
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'yawa' }).addPattern(pattern`|yawa`).addPattern(pattern`|yawaa`).addPattern(pattern`|pisting yawa`).addPattern(pattern`|pisti|`).addPattern(pattern`|piste|`).addPattern(pattern`|giatay`).addPattern(pattern`|atay ka`).addPattern(pattern`|buang|`).addPattern(pattern`|boang|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'bilat' }).addPattern(pattern`|bilat|`).addPattern(pattern`|otin|`).addPattern(pattern`|utin|`).addPattern(pattern`|iyot`).addPattern(pattern`|pisat|`).addPattern(pattern`|buktot|`).addPattern(pattern`|ulol ka`).addPattern(pattern`|gubot ka`).addPattern(pattern`|tarantado ka`))
  // Misspellings that got past the filter in live chat. Anchored so longer innocent words stay clear.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'fuck' }).addPattern(pattern`|fcuk`).addPattern(pattern`|fuq`).addPattern(pattern`|fvq`).addPattern(pattern`|fuk`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'dick' }).addPattern(pattern`|dicc|`).addPattern(pattern`|dic|`).addPattern(pattern`|dikk|`).addPattern(pattern`|dik|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'puke' }).addPattern(pattern`|puke|`).addPattern(pattern`|pukee|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'bobo' }).addPattern(pattern`|eoeo|`).addPattern(pattern`|bobu|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'otin' }).addPattern(pattern`|oten|`).addPattern(pattern`|uten|`).addPattern(pattern`|utan|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'burat' }).addPattern(pattern`|borat|`).addPattern(pattern`|burot|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'bilat' }).addPattern(pattern`|bilet|`))
  // Threats. Anchored so "kill the lag", "killer fit" and "this dress kills it" pass.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'threat' }).addPattern(pattern`|papatayin kita`).addPattern(pattern`|patayin kita`).addPattern(pattern`|ipapapatay`).addPattern(pattern`|bubugbugin kita`).addPattern(pattern`|patyon tika`).addPattern(pattern`|ipatay tika`).addPattern(pattern`|kill you`).addPattern(pattern`|kill u|`))

// Real words and places that contain a blocked fragment.
const EXTRA_WHITELIST = ['dickson', 'cockpit', 'shiitake', 'shitake', 'penistone', 'taehyung']

const built = words.build()
const matcher = new RegExpMatcher({
  ...built,
  whitelistedTerms: [...(built.whitelistedTerms ?? []), ...EXTRA_WHITELIST],
  ...englishRecommendedTransformers,
})

/** Shown when text is blocked. Generic on purpose: it never repeats the word that was caught. */
export const PROFANITY_ERROR = "This contains language that isn't allowed. Remove it and try again."

// "f u c k" and "f.u.c.k": a run of 3+ single letters split by one separator is joined. Ordinary text like "I a m here" has only 3 letters in
// the run, so it is joined too but "iam" matches nothing; the check runs on both the original and the joined text.
const SPACED = /(?<![\p{L}\p{N}])(?:\p{L}[\s.\-_*]){2,}\p{L}(?![\p{L}\p{N}])/gu
const collapse = (text: string) => text.replace(SPACED, (run) => run.replace(/[\s.\-_*]/g, ''))

/** True when the text holds a curse word, slur or sexual term, in English or Filipino. */
export function hasProfanity(text: string): boolean {
  return matcher.hasMatch(text) || matcher.hasMatch(collapse(text))
}

/** Swaps every letter in `text` for an asterisk and keeps spaces and dots, so "f u c k" becomes "* * * *" and the length never changes. */
const star = (text: string) => text.replace(/[^\s.\-_*]/gu, '*')

/** The text with each flagged word (including spaced-out ones) replaced by asterisks of the same length, and whether anything was replaced. */
export function maskProfanity(text: string): { text: string; offended: boolean } {
  const spacedMasked = text.replace(SPACED, (run) => (matcher.hasMatch(run.replace(/[\s.\-_*]/g, '')) ? star(run) : run))
  // Match indexes count UTF-16 units, so mask on the string itself rather than on code points.
  let out = spacedMasked
  for (const { startIndex, endIndex } of matcher.getAllMatches(spacedMasked, true).reverse()) {
    out = out.slice(0, startIndex) + '*'.repeat(endIndex - startIndex + 1) + out.slice(endIndex + 1)
  }
  return { text: out, offended: out !== text }
}
