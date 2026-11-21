import { COMMON_WORDS, MISSPELLINGS } from "../data/english";

const words = new Set(COMMON_WORDS);
for (const replacement of Object.values(MISSPELLINGS)) {
  if (!replacement.includes(" ")) words.add(replacement);
}
const ranks = new Map(Array.from(words, (word, index) => [word, index]));
let index: Map<string, Set<string>> | undefined;

function deletions(word: string): Set<string> {
  const result = new Set([word]);
  for (let i = 0; i < word.length; i++) {
    result.add(word.slice(0, i) + word.slice(i + 1));
  }
  return result;
}

export function isKnownWord(word: string): boolean {
  return words.has(word.toLowerCase());
}

export function matchCase(original: string, replacement: string): string {
  if (/^[A-Z]+$/.test(original)) return replacement.toUpperCase();
  if (/^[A-Z]/.test(original)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1)
      || (a[i] === b[i + 1] && a[i + 1] === b[i]
        && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length > b.length
    ? a.slice(i + 1) === b.slice(i)
    : a.slice(i) === b.slice(i + 1);
}

export function spellingCandidates(word: string): {
  replacements: string[];
  confidence: "high" | "medium";
} | undefined {
  if (/^[A-Z]{2,}$/.test(word) || /[a-z][A-Z]/.test(word)) return;
  const lower = word.toLowerCase();
  const exact = Object.hasOwn(MISSPELLINGS, lower) ? MISSPELLINGS[lower] : undefined;
  if (exact) {
    return { replacements: [matchCase(word, exact)], confidence: "high" };
  }
  if (words.has(lower) || word.length < 5 || word.length > 24
    || /['’]/.test(word) || /^[A-Z]/.test(word)) return;

  if (!index) {
    index = new Map();
    for (const known of words) {
      if (known.includes("'") || known.length < 3) continue;
      for (const key of deletions(known)) {
        const bucket = index.get(key) ?? new Set<string>();
        bucket.add(known);
        index.set(key, bucket);
      }
    }
  }

  const candidates = new Set<string>();
  for (const key of deletions(lower)) {
    for (const candidate of index.get(key) ?? []) {
      if (oneEditApart(lower, candidate)) candidates.add(candidate);
    }
  }
  const replacements = Array.from(candidates)
    .sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0))
    .slice(0, 3);
  if (replacements.length) return { replacements, confidence: "medium" };
}
