import type { Suggestion } from "./types";

type RankedSuggestion = Pick<Suggestion, "category" | "confidence" | "start" | "end">;

function priority(suggestion: RankedSuggestion): number {
  return suggestion.category === "zhuyin" ? 3 : suggestion.confidence === "high" ? 2 : 1;
}

export function compareSuggestionPriority(a: RankedSuggestion, b: RankedSuggestion): number {
  return priority(b) - priority(a) || (b.end - b.start) - (a.end - a.start) || a.start - b.start;
}

export function preferredSuggestion(suggestions: readonly Suggestion[]): Suggestion | undefined {
  let preferred: Suggestion | undefined;
  for (const suggestion of suggestions) {
    if (suggestion.replacements[0] !== undefined
      && (!preferred || compareSuggestionPriority(suggestion, preferred) < 0)) preferred = suggestion;
  }
  return preferred;
}
