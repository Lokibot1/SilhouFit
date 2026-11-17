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
  // More spellings and forms of the Tagalog and Bisaya words above: shortened, stretched, with "-ng" or "mo", and the common texting forms.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'tangina' }).addPattern(pattern`|tangina`).addPattern(pattern`|tanginang`).addPattern(pattern`|tangna`).addPattern(pattern`|tngina`).addPattern(pattern`|tnga|`).addPattern(pattern`|tang ina`).addPattern(pattern`|kingina`).addPattern(pattern`|kinangina`).addPattern(pattern`|kinginamo`).addPattern(pattern`|tanginamo`).addPattern(pattern`|tangina mo`).addPattern(pattern`|potangina`).addPattern(pattern`|putangna`).addPattern(pattern`|putang na`).addPattern(pattern`|putanginang`).addPattern(pattern`|putang inang`).addPattern(pattern`|putang ina`).addPattern(pattern`|ptangina`).addPattern(pattern`|ptngina`).addPattern(pattern`|ptang ina`).addPattern(pattern`|puta ng ina`).addPattern(pattern`|puta ina`).addPattern(pattern`|putaina`).addPattern(pattern`|putamina`).addPattern(pattern`|putaena`).addPattern(pattern`|putang ena`).addPattern(pattern`|potang ina`).addPattern(pattern`|pota ina`).addPattern(pattern`|potaena`).addPattern(pattern`|potangna`).addPattern(pattern`|pta ng ina`).addPattern(pattern`|puta mo`).addPattern(pattern`|putang mo`).addPattern(pattern`|putragis`).addPattern(pattern`|putres`).addPattern(pattern`|ampota`).addPattern(pattern`|amputa`).addPattern(pattern`|pucha|`).addPattern(pattern`|putek|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'gago' }).addPattern(pattern`|gagong`).addPattern(pattern`|gagu`).addPattern(pattern`|gagoo`).addPattern(pattern`|gagah|`).addPattern(pattern`|gag0`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'tanga' }).addPattern(pattern`|tangang`).addPattern(pattern`|tangahan`).addPattern(pattern`|bobong`).addPattern(pattern`|boboo`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'leche' }).addPattern(pattern`|lecheng`).addPattern(pattern`|letse|`).addPattern(pattern`|letseng`).addPattern(pattern`|lintik`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'peste' }).addPattern(pattern`|peste|`).addPattern(pattern`|pesteng`).addPattern(pattern`|hudas|`).addPattern(pattern`|demonyo ka`).addPattern(pattern`|salot ka`).addPattern(pattern`|bwiset`).addPattern(pattern`|punyemas`).addPattern(pattern`|pakshet`).addPattern(pattern`|shet|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'ulol' }).addPattern(pattern`|ulol`).addPattern(pattern`|ulul|`).addPattern(pattern`|olol`).addPattern(pattern`|siraulo`).addPattern(pattern`|sira-ulo`).addPattern(pattern`|kupal`).addPattern(pattern`|kupaal`).addPattern(pattern`|gunggong`).addPattern(pattern`|ungas`).addPattern(pattern`|engot`).addPattern(pattern`|shunga`).addPattern(pattern`|abnoy|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'pakyu' }).addPattern(pattern`|pakyu`).addPattern(pattern`|pak u|`).addPattern(pattern`|pak you`).addPattern(pattern`|pakyew`).addPattern(pattern`|pakiyu`).addPattern(pattern`|pakers|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'kantot' }).addPattern(pattern`|kantot`).addPattern(pattern`|kantutan`).addPattern(pattern`|kantutin`).addPattern(pattern`|hindot`).addPattern(pattern`|jakol`).addPattern(pattern`|jakul`).addPattern(pattern`|salsal`).addPattern(pattern`|supsop`).addPattern(pattern`|chupa|`).addPattern(pattern`|chupain`).addPattern(pattern`|iyot`).addPattern(pattern`|nagkantot`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'puki' }).addPattern(pattern`|puki|`).addPattern(pattern`|pukí`).addPattern(pattern`|puday|`).addPattern(pattern`|pukinang`).addPattern(pattern`|pokpok`).addPattern(pattern`|burat|`).addPattern(pattern`|bayag|`).addPattern(pattern`|tamod|`).addPattern(pattern`|etits|`).addPattern(pattern`|titi|`).addPattern(pattern`|tite|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'hayop' }).addPattern(pattern`|hayop ka`).addPattern(pattern`|hayup ka`).addPattern(pattern`|animal ka`).addPattern(pattern`|aso ka`).addPattern(pattern`|walang hiya`).addPattern(pattern`|bwisit`).addPattern(pattern`|buwisit`))
  // Bisaya.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'yawa' }).addPattern(pattern`|yawa`).addPattern(pattern`|yawaa`).addPattern(pattern`|pisting`).addPattern(pattern`|pisti`).addPattern(pattern`|piste|`).addPattern(pattern`|atay|`).addPattern(pattern`|atay ka`).addPattern(pattern`|giatay`).addPattern(pattern`|buang|`).addPattern(pattern`|boang|`).addPattern(pattern`|bilat`).addPattern(pattern`|otin|`).addPattern(pattern`|utin|`).addPattern(pattern`|pisat|`).addPattern(pattern`|buktot|`).addPattern(pattern`|animal ka`))
  // More English: acronyms, spellings and compounds the dataset can miss.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'wtf' }).addPattern(pattern`|wtf|`).addPattern(pattern`|stfu|`).addPattern(pattern`|gtfo|`).addPattern(pattern`|kys|`).addPattern(pattern`|mofo|`).addPattern(pattern`|bitchass`).addPattern(pattern`|dumbass`).addPattern(pattern`|jackass`).addPattern(pattern`|dipshit`).addPattern(pattern`|douchebag`).addPattern(pattern`|bullshit`).addPattern(pattern`|horseshit`).addPattern(pattern`|shithead`).addPattern(pattern`|fckn`).addPattern(pattern`|fcking`).addPattern(pattern`|fkn`).addPattern(pattern`|fking`).addPattern(pattern`|fck|`).addPattern(pattern`|fk|`).addPattern(pattern`|biatch`).addPattern(pattern`|b1tch`).addPattern(pattern`|sh1t`).addPattern(pattern`|a55`).addPattern(pattern`|pussy`).addPattern(pattern`|wanker`).addPattern(pattern`|twat|`).addPattern(pattern`|cunt`).addPattern(pattern`|cnt|`).addPattern(pattern`|prick|`).addPattern(pattern`|jerk off`).addPattern(pattern`|jerkoff`).addPattern(pattern`|blowjob`).addPattern(pattern`|handjob`).addPattern(pattern`|cumshot`))
  // Insults and rude phrases that are not curse words. Anchored, so "dumbbell" and "idiom" stay clear.
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'stupid' }).addPattern(pattern`|stupid`).addPattern(pattern`|stoopid`).addPattern(pattern`|stupd|`).addPattern(pattern`|idiot`).addPattern(pattern`|idiots|`).addPattern(pattern`|moron`).addPattern(pattern`|imbecile`).addPattern(pattern`|dumb|`).addPattern(pattern`|dummy ka`).addPattern(pattern`|loser|`).addPattern(pattern`|losers|`).addPattern(pattern`|scumbag`).addPattern(pattern`|trash ka`).addPattern(pattern`|basura ka`).addPattern(pattern`|pangit ka`).addPattern(pattern`|bobo ka`).addPattern(pattern`|tanga ka`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: 'shut up' }).addPattern(pattern`|shut up`).addPattern(pattern`|shutup`).addPattern(pattern`|tumahimik ka`).addPattern(pattern`|manahimik ka`).addPattern(pattern`|go to hell`).addPattern(pattern`|rot in hell`).addPattern(pattern`|go die`).addPattern(pattern`|drop dead`).addPattern(pattern`|kill yourself`).addPattern(pattern`|kill urself`).addPattern(pattern`|mamatay ka`).addPattern(pattern`|sana mamatay`).addPattern(pattern`|bwisit ka`))
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

// Ways to slip a word past a filter without changing how it reads: full-width and styled letters ("ｆｕｃｋ", "𝐟𝐮𝐜𝐤"), invisible characters
// between letters, and accents ("fúck", "tangiña"). `clean` is the text to keep; `fold` has the same length with accents removed, for matching.
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/gu
const prepare = (text: string) => {
  const clean = text.normalize('NFKC').replace(INVISIBLE, '')
  return { clean, fold: clean.replace(/[À-ɏ]/g, (letter) => (letter === 'ı' ? 'i' : letter.normalize('NFD')[0])) }
}

/** True when the text holds a curse word, slur, insult or sexual term, in English or Filipino. */
export function hasProfanity(text: string): boolean {
  const { fold } = prepare(text)
  return matcher.hasMatch(fold) || matcher.hasMatch(collapse(fold))
}

/** Swaps every letter in `text` for an asterisk and keeps spaces and dots, so "f u c k" becomes "* * * *" and the length never changes. */
const star = (text: string) => text.replace(/[^\s.\-_*]/gu, '*')

/** The text with each flagged word (including spaced-out ones) replaced by asterisks of the same length, and whether anything was replaced. */
export function maskProfanity(text: string): { text: string; offended: boolean } {
  const { clean, fold } = prepare(text)
  // The same spans are starred in both strings, so the matcher sees the folded text and the person keeps their own letters.
  const spaced: [number, number][] = []
  const spacedFold = fold.replace(SPACED, (run, offset: number) => {
    if (!matcher.hasMatch(run.replace(/[\s.\-_*]/g, ''))) return run
    spaced.push([offset, offset + run.length])
    return star(run)
  })
  // Match indexes count UTF-16 units, so mask on the string itself rather than on code points.
  let out = clean
  for (const [from, to] of spaced) out = out.slice(0, from) + star(out.slice(from, to)) + out.slice(to)
  for (const { startIndex, endIndex } of matcher.getAllMatches(spacedFold, true).reverse()) {
    out = out.slice(0, startIndex) + '*'.repeat(endIndex - startIndex + 1) + out.slice(endIndex + 1)
  }
  return { text: out, offended: out !== clean }
}
