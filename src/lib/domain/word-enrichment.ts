import type { Band, Vocabulary } from "./types";

const toneVowels: Record<string, string> = {
  a: "āáǎà",
  e: "ēéěè",
  i: "īíǐì",
  o: "ōóǒò",
  u: "ūúǔù",
  ü: "ǖǘǚǜ",
  A: "ĀÁǍÀ",
  E: "ĒÉĚÈ",
  I: "ĪÍǏÌ",
  O: "ŌÓǑÒ",
  U: "ŪÚǓÙ",
  Ü: "ǕǗǙǛ",
};
export function markedPinyin(numbered: string) {
  return numbered
    .replace(/u:/g, "ü")
    .replace(/U:/g, "Ü")
    .replace(
      /([A-Za-züÜ]+)([0-5])/g,
      (_match, syllable: string, digit: string) => {
        const tone = Number(digit);
        if (tone === 0 || tone === 5) return syllable;
        const lower = syllable.toLowerCase();
        let index = lower.indexOf("a");
        if (index < 0) index = lower.indexOf("e");
        if (index < 0) index = lower.indexOf("ou");
        if (index < 0) {
          for (let i = syllable.length - 1; i >= 0; i--)
            if (toneVowels[syllable[i]]) {
              index = i;
              break;
            }
        }
        if (index < 0 || !toneVowels[syllable[index]]) return syllable;
        return (
          syllable.slice(0, index) +
          toneVowels[syllable[index]][tone - 1] +
          syllable.slice(index + 1)
        );
      },
    );
}
export function readingKey(pinyin: string) {
  // Keep tones and capitalization: 白 bái must not silently inherit surname Bái.
  return markedPinyin(pinyin)
    .normalize("NFC")
    .replace(/[\s'’·\-]/g, "");
}
export const bandRank = (band: string) => (band === "7-9" ? 7 : Number(band));
export const rankBand = (rank: number): Band =>
  rank >= 7 ? "7-9" : (String(rank) as Band);
export type LevelToken = { text: string; band: Band };
export type LevelCheck = {
  version: "hsk2021-icu-v1";
  scope: "vocabulary-only";
  target_band: Band;
  max_band: Band;
  tokens: LevelToken[];
};
type Lexeme = { band: Band; readings: Set<string> };
export function createSentenceChecker(vocabulary: Vocabulary[]) {
  const words = new Map<string, Lexeme>();
  for (const v of vocabulary) {
    const current = words.get(v.word);
    if (current) {
      current.band = rankBand(
        Math.max(bandRank(current.band), bandRank(v.band)),
      );
      current.readings.add(readingKey(v.pinyin));
    } else
      words.set(v.word, {
        band: v.band,
        readings: new Set([readingKey(v.pinyin)]),
      });
  }
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
  return (
    sentence: string,
    target: Vocabulary,
  ):
    | { accepted: true; level: LevelCheck }
    | { accepted: false; reason: string } => {
    const limit = [0, 14, 18, 22, 26, 30, 34, 40][bandRank(target.band)];
    if ([...sentence].length > limit)
      return { accepted: false, reason: "sentence-too-long" };
    if (!/^[\p{Script=Han}\p{P}\s]+$/u.test(sentence))
      return { accepted: false, reason: "non-hsk-text" };
    if (words.get(target.word)!.readings.size !== 1)
      return { accepted: false, reason: "target-reading-ambiguous" };
    const pieces = [...segmenter.segment(sentence)].filter((s) => s.isWordLike);
    // No splitting unknown compounds into easy characters to manufacture a low Band.
    if (pieces.some((s) => !/^[\p{Script=Han}]+$/u.test(s.segment)))
      return { accepted: false, reason: "non-hsk-text" };
    const targetStart = pieces.findIndex(
      (s, index) =>
        sentence.startsWith(target.word, s.index) &&
        pieces.some(
          (end, endIndex) =>
            endIndex >= index &&
            end.index + end.segment.length === s.index + target.word.length,
        ),
    );
    if (targetStart < 0)
      return { accepted: false, reason: "target-not-a-word-boundary" };
    const targetEnd = pieces[targetStart].index + target.word.length;
    const tokens: LevelToken[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const part = pieces[i];
      if (i === targetStart) {
        tokens.push({ text: target.word, band: target.band });
        while (i + 1 < pieces.length && pieces[i + 1].index < targetEnd) i++;
        continue;
      }
      const lexeme = words.get(part.segment);
      if (!lexeme) return { accepted: false, reason: "unknown-word" };
      if (bandRank(lexeme.band) > bandRank(target.band))
        return { accepted: false, reason: "higher-band-word" };
      tokens.push({ text: part.segment, band: lexeme.band });
    }
    if (tokens.length < 3 || new Set(tokens.map((t) => t.text)).size < 3)
      return { accepted: false, reason: "fragment-too-short" };
    const maximum = Math.max(...tokens.map((t) => bandRank(t.band)));
    return {
      accepted: true,
      level: {
        version: "hsk2021-icu-v1",
        scope: "vocabulary-only",
        target_band: target.band,
        max_band: rankBand(maximum),
        tokens,
      },
    };
  };
}
