import { CHINESE_FIXED_TYPOS, CHINESE_TYPOS } from "../data/chinese";
import { applyEdits } from "./edits";
import { isProtected, overlaps } from "./protected";
import { MAX_SUGGESTIONS, type Suggestion, type TextRange } from "./types";

type ChineseDraft = Omit<Suggestion, "id" | "original">;
type Confidence = Suggestion["confidence"];
interface WordRule {
  original: string;
  replacement: string;
  confidence: Confidence;
}

// One pass over the text, checking only the words that begin at each character.
const wordsByFirstCharacter = new Map<string, WordRule[]>();
for (const [entries, confidence] of [[CHINESE_FIXED_TYPOS, "high"], [CHINESE_TYPOS, "medium"]] as const) {
  for (const [original, replacement] of entries) {
    const first = original.charAt(0);
    const entries = wordsByFirstCharacter.get(first) ?? [];
    entries.push({ original, replacement, confidence });
    wordsByFirstCharacter.set(first, entries);
  }
}
for (const entries of wordsByFirstCharacter.values()) {
  entries.sort((a, b) => b.original.length - a.original.length);
}

const grammarRules = [
  { pattern: /(?<!不)盡然(?=會|能|是|有|敢|還|連|也)/g,
    replacement: "竟然", message: "若要表示出乎預料，可用「竟然」。" },
  { pattern: /(?<![可足難])以經(?!歷|驗|由|營|理|紀|費|濟|銷|典|手|商)/g,
    replacement: "已經", message: "表示動作已完成或狀態已發生時，使用「已經」。" },
  { pattern: /(?:請|讓我|我們|他想|她想)在一次(?=確認|試試|說明|檢查|嘗試|測試|閱讀|核對)/g,
    replacement: (value: string) => value.replace("在一次", "再一次"), message: "表示重複動作時，使用「再」。" },
  { pattern: /(?<=仔細|認真|耐心|慢慢|清楚|快速)的(?=檢查|閱讀|聆聽|說明|解釋|回答|處理|完成|記錄|走過來)/g,
    replacement: "地", message: "這裡修飾動作，可用「地」；若在描述名詞，可保留原文。" },
  { pattern: /(?<=跑|走|做|寫|打|說|表現)的(?=很快|很慢|很清楚|很好|很順利|太慢|太快)/g,
    replacement: "得", message: "補充動作的程度或結果時，可用「得」。" },
  { pattern: /(?<=是否)有沒有(?=收到|看到|完成|確認|更新|問題|需要)/g,
    replacement: "有", message: "「是否」已表示疑問，避免再使用「有沒有」。" },
  { pattern: /大約[一二三四五六七八九十百千兩\d]+(?:分鐘|小時|公分|公里|人|天)左右/g,
    replacement: (value: string) => value.slice(0, -2), message: "「大約」與「左右」皆表示約數，可以擇一。" },
] as const;

export function findChineseCorrections(text: string, protectedText: TextRange[] = []): ChineseDraft[] {
  const suggestions: ChineseDraft[] = [];
  function add(start: number, original: string, replacement: string, confidence: Confidence, message: string) {
    const range = { start, end: start + original.length };
    if (suggestions.length <= MAX_SUGGESTIONS && !isProtected(range, protectedText)) {
      suggestions.push({ ...range, replacements: [replacement], category: "chinese", confidence, message });
    }
  }
  for (let start = 0; start < text.length && suggestions.length <= MAX_SUGGESTIONS; start++) {
    for (const { original, replacement, confidence } of wordsByFirstCharacter.get(text.charAt(start)) ?? []) {
      if (text.startsWith(original, start)) {
        add(start, original, replacement, confidence,
          confidence === "high" ? "固定詞語的標準寫法。" : "常見中文用字建議，請依語境確認。");
      }
    }
  }
  for (const { pattern, replacement, message } of grammarRules) {
    for (const match of text.matchAll(pattern)) {
      if (suggestions.length > MAX_SUGGESTIONS) break;
      add(match.index, match[0], typeof replacement === "string" ? replacement : replacement(match[0]), "medium", message);
    }
  }
  return suggestions;
}

function revise(text: string, includeMedium: boolean): string {
  const patches: { start: number; end: number; original: string; replacement: string }[] = [];
  const drafts = findChineseCorrections(text).sort((a, b) =>
    Number(b.confidence === "high") - Number(a.confidence === "high") || b.end - b.start - (a.end - a.start));
  for (const draft of drafts) {
    if ((draft.confidence === "medium" && !includeMedium) || patches.some((item) => overlaps(item, draft))) continue;
    const replacement = draft.replacements[0];
    if (replacement !== undefined) patches.push({
      start: draft.start, end: draft.end, original: text.slice(draft.start, draft.end), replacement,
    });
  }
  return applyEdits(text, patches);
}

export function refineChineseCandidate(text: string): string[] {
  const fixed = revise(text, false);
  const optional = revise(fixed, true);
  return optional === fixed ? [fixed] : [fixed, optional];
}
