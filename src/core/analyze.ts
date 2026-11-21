import { CHINESE_TYPOS } from "../data/chinese";
import { isProtected, overlaps, protectedRanges } from "./protected";
import { isKnownWord, matchCase, spellingCandidates } from "./spelling";
import { decodeZhuyin, toPhonetic } from "./zhuyin";
import {
  MAX_SUGGESTIONS, MAX_RESULT_LENGTH,
  type AnalysisOptions, type AnalysisResult, type Suggestion, type TextRange,
} from "./types";

type Draft = Omit<Suggestion, "id" | "original">;

const silentH = /^(?:honest|honor|honour|hour|heir)/i;
const consonantVowels = /^(?:universit|uniform|unique|union|units?$|united|unicorn|users?$|use(?:s|d|ful)?$|usual|european|one(?:$|s$)|once$)/i;
const initialisms = new Set([
  "API", "MRI", "FBI", "HTML", "HTTP", "HTTPS", "AI", "XML", "SMS", "SSL",
  "SDK", "CPU", "GPU", "USB", "UI", "UX", "URL", "ID",
]);

function takesAn(word: string): boolean | undefined {
  if (/^(?:NASA|NATO|FIFA|UNESCO|UNICEF|RAM|ROM)$/.test(word)) return false;
  if (/^[A-Z]{2,}$/.test(word)) {
    if (initialisms.has(word)) return /^[AEFHILMNORSX]/.test(word);
    if (isKnownWord(word)) return takesAn(word.toLowerCase());
    // Unfamiliar acronyms can be pronounced as letters or as a word.
    return undefined;
  }
  return silentH.test(word) || (!consonantVowels.test(word) && /^[aeiou]/i.test(word));
}

function recoverKeyboard(
  text: string, mode: AnalysisOptions["mode"], protectedText: TextRange[],
): Draft[] {
  const tokens = Array.from(text.matchAll(/[A-Za-z0-9,;./-]+/g));
  const suggestions: Draft[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i];
    if (!first || isProtected({ start: first.index, end: first.index + first[0].length }, protectedText)) continue;
    let best: { draft: Draft; last: number } | undefined;
    for (let j = i; j < Math.min(i + 6, tokens.length); j++) {
      const token = tokens[j];
      if (!token) break;
      const previous = tokens[j - 1];
      if (j > i && previous
        && !/^[ \t]+$/.test(text.slice(previous.index + previous[0].length, token.index))) break;
      if (isProtected({ start: token.index, end: token.index + token[0].length }, protectedText)) break;
      if (mode === "auto" && (isKnownWord(token[0]) || /[A-Z]/.test(token[0]))) break;
      let end = token.index + token[0].length;
      let raw = text.slice(first.index, end);
      let candidates = decodeZhuyin(raw);
      if (!candidates.length && /[.,;]$/.test(raw)) {
        end--;
        raw = text.slice(first.index, end);
        candidates = decodeZhuyin(raw);
      }
      const leading = candidates[0];
      if (!leading) continue;
      if (mode === "auto" && !/[3467]/.test(raw)
        && (raw.replace(/\s/g, "").length < 6 || leading.syllables < 2)) continue;
      best = {
        last: j,
        draft: {
          start: first.index, end,
          replacements: candidates.map((candidate) => candidate.text),
          category: "zhuyin", confidence: "medium",
          message: `標準注音鍵盤：${toPhonetic(raw)}`,
        },
      };
    }
    if (best) {
      suggestions.push(best.draft);
      i = best.last;
    }
    if (suggestions.length >= MAX_SUGGESTIONS + 1) break;
  }
  return suggestions;
}

export function analyze(
  text: string, options: AnalysisOptions = { mode: "auto", spacing: false },
): AnalysisResult {
  if (text.length > MAX_RESULT_LENGTH) throw new Error("Text exceeds the analysis limit.");
  if (!["auto", "english", "zhuyin"].includes(options.mode)) throw new Error("Unknown analysis mode.");
  const protectedText = protectedRanges(text);
  const drafts: Draft[] = [];
  const add = (draft: Draft) => {
    if (drafts.length < 500 && !isProtected(draft, protectedText)) drafts.push(draft);
  };
  if (options.mode !== "english") {
    drafts.push(...recoverKeyboard(text, options.mode, protectedText));
  }
  if (options.mode !== "zhuyin") {
    const spellingCache = new Map<string, ReturnType<typeof spellingCandidates>>();
    for (const match of text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
      const range = { start: match.index, end: match.index + match[0].length };
      if (isProtected(range, protectedText) || drafts.some((draft) => overlaps(draft, range))) continue;
      // Digits and non-ASCII letters attached to a token may be IDs, not prose.
      const before = text[range.start - 1] ?? "";
      const after = text[range.end] ?? "";
      if (/[0-9_\p{Script=Latin}]/u.test(before) || /[0-9_\p{Script=Latin}]/u.test(after)) continue;
      if (!spellingCache.has(match[0])) spellingCache.set(match[0], spellingCandidates(match[0]));
      const candidate = spellingCache.get(match[0]);
      if (candidate) add({
        ...range, ...candidate, category: "spelling",
        message: candidate.confidence === "high" ? "常見英文誤拼。" : "與常用字相差一個編輯步驟，也可能是專有名詞。",
      });
    }

    for (const match of text.matchAll(/(?<![\p{L}\p{N}_'])i(?![\p{L}\p{N}_])/gu)) {
      add({
        start: match.index, end: match.index + 1, replacements: ["I"],
        category: "grammar", confidence: "high", message: "英文第一人稱 I 使用大寫。",
      });
    }
    for (const match of text.matchAll(/\b(i|you|we|they|he|she|it)([ \t]+)(am|is|are|has|have)\b/gi)) {
      const subject = match[1]?.toLowerCase();
      const verb = match[3];
      if (!subject || !verb) continue;
      const plural = ["you", "we", "they"].includes(subject);
      const expected = /^(?:has|have)$/i.test(verb)
        ? (plural || subject === "i" ? "have" : "has")
        : (subject === "i" ? "am" : plural ? "are" : "is");
      if (verb.toLowerCase() === expected) continue;
      const start = match.index + match[0].length - verb.length;
      add({
        start, end: start + verb.length, replacements: [matchCase(verb, expected)],
        category: "grammar", confidence: "high", message: "基本主詞與動詞一致性。",
      });
    }
    for (const match of text.matchAll(/\b(a|an)([ \t]+)([A-Za-z]+)\b/gi)) {
      const article = match[1];
      const word = match[3];
      if (!article || !word) continue;
      const vowelSound = takesAn(word);
      if (vowelSound === undefined) continue;
      const expected = vowelSound ? "an" : "a";
      if (article.toLowerCase() === expected) continue;
      add({
        start: match.index, end: match.index + article.length,
        replacements: [matchCase(article, expected)],
        category: "grammar", confidence: "high", message: "依常見發音選擇 a／an。",
      });
    }
    for (const match of text.matchAll(/\b(the|a|an|and|or|to|of|in|on|for|with)([ \t]+)\1\b/gi)) {
      add({
        start: match.index, end: match.index + match[0].length,
        replacements: [match[1] ?? ""], category: "grammar", confidence: "high",
        message: "相鄰重複單字；保留一個。",
      });
    }
    for (const match of text.matchAll(/[A-Za-z]{2,}([,;:!?])(?=[A-Za-z])/g)) {
      const start = match.index + match[0].length - 1;
      add({
        start, end: start + 1, replacements: [`${match[1]} `],
        category: "spacing", confidence: "high", message: "英文標點後補上空格。",
      });
    }

    if (options.mode === "auto") {
      for (const [original, replacement] of CHINESE_TYPOS) {
        let start = text.indexOf(original);
        while (start !== -1 && drafts.length < 500) {
          add({
            start, end: start + original.length, replacements: [replacement],
            category: "chinese", confidence: "medium", message: "常見中文詞組用字建議。",
          });
          start = text.indexOf(original, start + original.length);
        }
      }
    }
    if (options.spacing) {
      for (const match of text.matchAll(/(?<=\p{Script=Han})(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=\p{Script=Han})/gu)) {
        add({
          start: match.index, end: match.index, replacements: [" "],
          category: "spacing", confidence: "high", message: "中文與英數之間補上空格。",
        });
      }
    }
  }

  // Keyboard recovery wins over English rules; longer overlapping fixes win.
  const priority = (draft: Draft) =>
    draft.category === "zhuyin" ? 3 : draft.confidence === "high" ? 2 : 1;
  drafts.sort((a, b) => priority(b) - priority(a)
    || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const resolved: Draft[] = [];
  for (const draft of drafts) {
    if (!resolved.some((item) => overlaps(item, draft)
      || (item.start === draft.start && item.end === draft.end))) resolved.push(draft);
  }
  resolved.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    suggestions: resolved.slice(0, MAX_SUGGESTIONS).map((draft) => ({
      ...draft, original: text.slice(draft.start, draft.end),
      id: `${draft.category}:${draft.start}:${draft.end}`,
    })),
    limited: resolved.length > MAX_SUGGESTIONS || drafts.length >= 500,
  };
}
