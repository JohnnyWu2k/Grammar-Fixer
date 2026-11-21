import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/core/analyze";
import { applyEdits } from "../../src/core/edits";
import type { Edit, Suggestion } from "../../src/core/types";
import { EditorState } from "../../src/ui/state";

function first(text: string): Suggestion {
  const suggestion = analyze(text, { mode: "english", spacing: false }).suggestions[0];
  if (!suggestion) throw new Error("Test expected a suggestion.");
  return suggestion;
}
function edit(suggestion: Suggestion): Edit {
  return { ...suggestion, replacement: suggestion.replacements[0] ?? "" };
}

describe("safe edit application", () => {
  test("applies several edits against original offsets", () => {
    expect(applyEdits("teh adress", [
      { start: 0, end: 3, original: "teh", replacement: "the" },
      { start: 4, end: 10, original: "adress", replacement: "address" },
    ])).toBe("the address");
  });
  test("rejects stale, invalid, overlapping and duplicate edits", () => {
    expect(() => applyEdits("hello", [{ start: 0, end: 3, original: "teh", replacement: "the" }])).toThrow();
    expect(() => applyEdits("hello", [{ start: -1, end: 0, original: "", replacement: "x" }])).toThrow();
    expect(() => applyEdits("hello", [
      { start: 0, end: 3, original: "hel", replacement: "x" },
      { start: 2, end: 5, original: "llo", replacement: "y" },
    ])).toThrow();
    const insertion = { start: 1, end: 1, original: "", replacement: " " };
    expect(() => applyEdits("hi", [insertion, insertion])).toThrow();
  });
  test("allows a spacing insertion at the boundary of a spelling edit", () => {
    expect(applyEdits("中teh", [
      { start: 1, end: 1, original: "", replacement: " " },
      { start: 1, end: 4, original: "teh", replacement: "the" },
    ])).toBe("中 the");
  });
});

describe("review state", () => {
  test("preserves source, applies results, highlights and undoes a batch", () => {
    const state = new EditorState();
    state.setSource("teh idea");
    state.apply([edit(first(state.text))]);
    expect(state.source).toBe("teh idea");
    expect(state.text).toBe("the idea");
    expect(state.appliedCount).toBe(1);
    expect(state.changes).toEqual([{ start: 0, end: 3 }]);
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.text).toBe("teh idea");
    expect(state.appliedCount).toBe(0);
    expect(state.changes).toEqual([]);
    expect(state.canUndo).toBe(false);
  });
  test("tracks ignored suggestions as earlier text grows", () => {
    const state = new EditorState();
    state.setSource("adress teh");
    const suggestions = analyze(state.text, { mode: "english", spacing: false }).suggestions;
    const ignored = suggestions[1];
    const accepted = suggestions[0];
    if (!ignored || !accepted) throw new Error("Missing test suggestions");
    state.ignore(ignored);
    state.apply([edit(accepted)]);
    expect(state.visible(analyze(state.text, { mode: "english", spacing: false }).suggestions)).toEqual([]);
    state.resetIgnored();
    expect(state.visible(analyze(state.text, { mode: "english", spacing: false }).suggestions)).toHaveLength(1);
  });
  test("resets applied edits and history when source changes", () => {
    const state = new EditorState();
    state.setSource("teh");
    state.apply([edit(first(state.text))]);
    state.setSource("new text");
    expect(state.source).toBe("new text");
    expect(state.text).toBe("new text");
    expect(state.canUndo).toBe(false);
    expect(state.appliedCount).toBe(0);
  });
  test("does not mutate state on stale edit failure", () => {
    const state = new EditorState();
    state.setSource("hello");
    expect(() => state.apply([edit(first("teh"))])).toThrow();
    expect(state.text).toBe("hello");
    expect(state.canUndo).toBe(false);
  });
  test("does not create a history entry for empty changes", () => {
    const state = new EditorState();
    state.setSource("hello");
    state.apply([]);
    state.undo();
    expect(state.text).toBe("hello");
    expect(state.canUndo).toBe(false);
  });
  test("bounds source length and restores highlight offsets across multiple edits", () => {
    const state = new EditorState();
    expect(() => state.setSource("a".repeat(10_001))).toThrow();
    state.setSource("adress teh");
    state.apply([edit(first(state.text))]);
    state.apply([edit(first(state.text))]);
    expect(state.text).toBe("address the");
    expect(state.changes).toEqual([{ start: 0, end: 7 }, { start: 8, end: 11 }]);
    state.undo();
    expect(state.text).toBe("address teh");
    expect(state.changes).toEqual([{ start: 0, end: 7 }]);
  });
});
