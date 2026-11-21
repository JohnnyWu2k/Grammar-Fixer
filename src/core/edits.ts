import { overlaps } from "./protected";
import type { Edit } from "./types";

export function applyEdits(text: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 0; i < sorted.length; i++) {
    const edit = sorted[i];
    if (!edit) continue;
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end)
      || edit.start < 0 || edit.end < edit.start || edit.end > text.length
      || text.slice(edit.start, edit.end) !== edit.original) {
      throw new Error("The text has changed. Analyze it again before applying edits.");
    }
    const previous = sorted[i - 1];
    if (previous && (overlaps(previous, edit)
      || (previous.start === edit.start && previous.end === edit.end))) {
      throw new Error("Overlapping edits cannot be applied together.");
    }
  }
  let result = text;
  for (const edit of sorted.reverse()) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}
