import { refineChineseCandidate } from "./chinese";
import { isProtected } from "./protected";
import { isKnownWord, spellingCandidates } from "./spelling";
import type { AnalysisOptions, Suggestion, TextRange } from "./types";
import { MAX_SUGGESTIONS } from "./types";
import { decodeZhuyin, toPhonetic, type ZhuyinCandidate } from "./zhuyin";
import { normalizeKeys } from "./zhuyin-keys";

type Recovery = Omit<Suggestion, "id" | "original">;

interface Reading extends TextRange {
  raw: string;
  candidates: ZhuyinCandidate[];
}

const toneKeys = /[3467]/;
const numericSyllable = /^[012589]{1,2}[3467]$/;
const asciiPunctuation = /[,.;]/;
const markedSeparator = /(?<=[3467])[,.;](?=[a-z0-9])(?![3467])/i;

function scanKeys(text: string): string {
  return text.replace(/[Ａ-Ｚａ-ｚ０-９　]/g, normalizeKeys);
}

function hasEnglishEvidence(word: string): boolean {
  const core = word.replace(/^[,.;/-]+|[,.;/-]+$/g, "");
  if (isKnownWord(core)) return true;
  if (/^[A-Za-z]+(?:-[A-Za-z]+)+$/.test(core)
    && core.split("-").some(isKnownWord)) return true;
  return /[a-z][A-Z]|[A-Z]{2,}[a-z]/.test(core)
    || (/[A-Z]/.test(core) && !toneKeys.test(core));
}

function isLiteral(raw: string): boolean {
  return /^\d+(?:[.,/-]\d+)*$/.test(raw)
    || /^[A-Z]\d{1,2}$/.test(raw)
    || /^(?:v\d+(?:\.\d+)+|[A-Z]{2,}-\d+|[A-Z0-9]+-\d+-[A-Z0-9]+)$/i.test(raw);
}

export function mayNeedZhuyinDictionary(text: string, mode: AnalysisOptions["mode"]): boolean {
  if (mode === "english") return false;
  if (mode === "zhuyin") return /[A-Za-z0-9]/.test(scanKeys(text));
  for (const match of scanKeys(text).matchAll(/[A-Za-z0-9,;./-]{2,}/g)) {
    if (!isLiteral(match[0]) && !hasEnglishEvidence(match[0])) return true;
  }
  return false;
}

function suitable(
  candidate: ZhuyinCandidate, raw: string, mode: AnalysisOptions["mode"],
): boolean {
  if (mode === "zhuyin") return true;
  const keys = raw.replace(/\s/g, "");
  if (isLiteral(keys)) return false;
  if (toneKeys.test(keys)) {
    // A marked syllable is useful evidence, but don't suggest long gibberish
    // that could only be decoded by stitching together unlikely characters.
    if (candidate.syllables === 1) return candidate.score >= -5.5;
    if (candidate.impliedSplits > 1) return false;
    if (candidate.wordSyllables === 0) {
      return candidate.syllables <= 2 && candidate.missingTones === 0
        && candidate.impliedSplits === 0 && candidate.score / candidate.syllables >= -2.3;
    }
    return candidate.score / candidate.syllables >= -5.5
      && (candidate.wordSyllables * 2 >= candidate.syllables
        || (candidate.missingTones === 0 && candidate.impliedSplits === 0));
  }
  return keys.length >= 4 && candidate.syllables >= 2
    && candidate.strongestWord >= 45
    && candidate.wordSyllables * 3 >= candidate.syllables * 2
    && (candidate.missingTones * 2 <= candidate.syllables
      || (candidate.wordSyllables === candidate.syllables && candidate.strongestWord >= 300))
    && candidate.impliedSplits <= 1
    && (!/^[a-z]+$/i.test(keys) || spellingCandidates(keys)?.confidence !== "high");
}

function findReading(
  text: string, start: number, end: number, mode: AnalysisOptions["mode"],
): Reading | undefined {
  const get = (from: number, to: number): Reading | undefined => {
    const raw = text.slice(from, to);
    if (!raw || raw.length > 320
      || (raw.length === 1 && (mode !== "zhuyin" || !/[a-z0-9]/i.test(raw)))
      || (mode === "auto" && isLiteral(raw.trim()))) return;
    const candidates = decodeZhuyin(raw).filter((candidate) => suitable(candidate, raw, mode));
    const leading = candidates[0];
    if (leading) return {
      start: from, end: to, raw,
      candidates: mode === "auto" ? candidates.filter((candidate) => leading.score - candidate.score <= 3.6) : candidates,
    };
  };
  const full = get(start, end);
  let left = start;
  let right = end;
  if (asciiPunctuation.test(text[left] ?? "")) left++;
  if (asciiPunctuation.test(text[right - 1] ?? "")) right--;
  const trimmed = (left !== start || right !== end) ? get(left, right) : undefined;
  if (!full) return trimmed;
  // Final comma/period/semicolon may be a phonetic key (ㄝ/ㄡ/ㄤ).
  // Leave it as punctuation if taking it makes an unnecessary extra syllable.
  if (trimmed && trimmed.candidates[0]!.syllables < full.candidates[0]!.syllables
    && trimmed.candidates[0]!.score > full.candidates[0]!.score) return trimmed;
  return full;
}

function asSuggestion(reading: Reading): Recovery {
  const refined = reading.candidates.map((candidate) => refineChineseCandidate(candidate.text));
  const replacements = [...new Set(refined.flat())].slice(0, 5);
  const checked = refined.some((candidates, index) =>
    candidates.length > 1 || candidates[0] !== reading.candidates[index]?.text);
  return {
    start: reading.start, end: reading.end,
    replacements,
    category: "zhuyin", confidence: "medium",
    message: `標準注音鍵盤：${toPhonetic(reading.raw)}${checked ? "；已依中文用字規則檢查候選。" : ""}`,
  };
}

export function recoverKeyboard(
  text: string, mode: AnalysisOptions["mode"], protectedText: TextRange[],
): Recovery[] {
  // Chinese punctuation is a separator; full-width letters/digits and spaces
  // are normalized without changing offsets.
  const keys = scanKeys(text);
  const tokens = Array.from(keys.matchAll(/[A-Za-z0-9,;./-]+/g));
  const suggestions: Recovery[] = [];
  const eligible = (token: RegExpMatchArray & { index: number }, allowNumericSyllable = false) => {
    const { index } = token;
    const raw = token[0];
    const end = index + raw.length;
    if (isProtected({ start: index, end }, protectedText)) return false;
    // Leave contractions, identifiers containing underscores, and accented
    // Latin words intact rather than converting a substring of them.
    if (/[_'’\p{Script=Latin}]/u.test(keys[index - 1] ?? "")
      || /[_'’\p{Script=Latin}]/u.test(keys[end] ?? "")) return false;
    return mode !== "auto" || (!hasEnglishEvidence(raw) && (allowNumericSyllable || !isLiteral(raw)));
  };
  for (let i = 0; i < tokens.length && suggestions.length <= MAX_SUGGESTIONS; i++) {
    const first = tokens[i];
    if (!first || !eligible(first)) continue;
    const raw = first[0];
    // After a completed, marked syllable, punctuation followed by a non-tone
    // is more likely prose punctuation than a standalone ㄝ, ㄡ or ㄤ.
    // Also keep a recognizable English suffix after a marked Zhuyin fragment.
    const separator = markedSeparator.test(raw);
    const englishSuffix = mode === "auto" ? raw.match(/(?<=[3467])[A-Za-z]{3,}$/) : null;
    const suffixReading = englishSuffix?.index !== undefined && isKnownWord(englishSuffix[0])
      ? findReading(keys, first.index, first.index + englishSuffix.index, mode) : undefined;
    if (suffixReading && !separator) {
      const complete = findReading(keys, first.index, first.index + raw.length, mode);
      if (!complete || complete.candidates[0]!.wordSyllables < complete.candidates[0]!.syllables) {
        suggestions.push(asSuggestion(suffixReading));
        continue;
      }
    }
    let best: Reading | undefined;
    let last = i;
    for (let j = i; j < Math.min(i + 12, tokens.length); j++) {
      const token = tokens[j];
      if (!token || separator) break;
      const numericContinuation = mode === "auto" && j > i && numericSyllable.test(token[0]);
      if (!eligible(token, numericContinuation)) break;
      const previous = tokens[j - 1];
      if (j > i && previous
        && !/^[ \t]+$/.test(keys.slice(previous.index + previous[0].length, token.index))) break;
      const candidate = findReading(keys, first.index, token.index + token[0].length, mode);
      if (numericContinuation) {
        // 503 can mean ㄓㄢˇ, but don't absorb a separate number unless the
        // leading reading uses it to finish a longer, tone-matching dictionary word.
        const matchesWord = ({ trailingWordSyllables, missingTones, impliedSplits }: ZhuyinCandidate) =>
          trailingWordSyllables >= 3 && missingTones === 0 && impliedSplits === 0;
        if (!candidate?.candidates[0] || !matchesWord(candidate.candidates[0])) break;
        candidate.candidates = candidate.candidates.filter(matchesWord);
      }
      if (candidate) {
        best = candidate;
        last = j;
      }
    }
    if (best) {
      suggestions.push(asSuggestion(best));
      i = last;
      continue;
    }

    // If ASCII punctuation joined two otherwise valid readings, retry at
    // possible separators. Do not split a successful reading such as vu,4.
    if (raw.length > 160 || isLiteral(raw) || !asciiPunctuation.test(raw)) continue;
    const cuts = Array.from(raw.matchAll(/[,.;]/g), (match) => match.index);
    if (cuts.length > 12) continue;
    const ends = [...cuts, raw.length];
    let start = 0;
    for (let part = 0; part < ends.length; part++) {
      let match: Reading | undefined;
      let nextPart = part;
      for (let end = part; end < ends.length; end++) {
        const boundary = ends[end];
        if (boundary === undefined || boundary <= start) continue;
        const fragment = raw.slice(start, boundary);
        if (separator && markedSeparator.test(fragment)) break;
        if (mode === "auto" && hasEnglishEvidence(fragment)) continue;
        const candidate = findReading(keys, first.index + start, first.index + boundary, mode);
        if (candidate) {
          match = candidate;
          nextPart = end;
        }
      }
      if (match) suggestions.push(asSuggestion(match));
      part = nextPart;
      start = (ends[part] ?? raw.length) + 1;
      if (suggestions.length > MAX_SUGGESTIONS) break;
    }
  }
  return suggestions;
}
