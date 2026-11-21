import type { TextRange } from "./types";

// All offsets, including textarea selections, use UTF-16 code units.
export function protectedRanges(text: string): TextRange[] {
  const patterns = [
    /```[\s\S]*?(?:```|$)/g,
    /~~~[\s\S]*?(?:~~~|$)/g,
    /`[^`\n]*(?:`|$)/gm,
    /https?:\/\/[^\s<>"`]+/gi,
    /www\.[^\s<>"`]+/gi,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /(?:[A-Z]:\\|\.{1,2}\/|\/(?:usr|home|var|etc)\/)[^\s<>"`]+/gi,
    /<\/?[A-Za-z][^>\n]*>/g,
    /(?:^|\s)[@#][A-Za-z0-9_]+/g,
    /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g,
    /\b[A-Za-z]+(?:\.[A-Za-z]+)+\b/g,
  ];
  const ranges = patterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern), (match) => ({
      start: match.index,
      end: match.index + match[0].length,
    })),
  );
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: TextRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function overlaps(a: TextRange, b: TextRange): boolean {
  if (a.start === a.end) return a.start > b.start && a.start < b.end;
  if (b.start === b.end) return b.start > a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

export function isProtected(range: TextRange, protectedText: TextRange[]): boolean {
  return protectedText.some((item) => overlaps(range, item));
}
