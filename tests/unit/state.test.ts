import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/core/analyze";
import { applyEdits } from "../../src/core/edits";
import { MAX_TEXT_LENGTH, type Edit, type Suggestion } from "../../src/core/types";
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

describe("single editor state", () => {
  test("applies a correction in place and preserves it on later input", () => {
    const state = new EditorState("teh idea");
    const caret = state.apply([edit(first(state.text))], { start: 8, end: 8 });
    expect(caret).toMatchObject({ start: 8, end: 8 });
    state.edit("the idea is ready.", caret);
    expect(state.text).toBe("the idea is ready.");
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.text).toBe("the idea");
    state.undo();
    expect(state.text).toBe("teh idea");
    expect(state.canUndo).toBe(false);
    state.redo();
    state.redo();
    expect(state.text).toBe("the idea is ready.");
  });
  test("tracks ignored suggestions after applying or typing before them", () => {
    const state = new EditorState("adress teh");
    const suggestions = analyze(state.text, { mode: "english", spacing: false }).suggestions;
    const ignored = suggestions[1];
    const accepted = suggestions[0];
    if (!ignored || !accepted) throw new Error("Missing test suggestions");
    state.ignore(ignored);
    state.apply([edit(accepted)]);
    state.edit("My address teh");
    expect(state.visible(analyze(state.text, { mode: "english", spacing: false }).suggestions)).toEqual([]);
    state.resetIgnored();
    expect(state.visible(analyze(state.text, { mode: "english", spacing: false }).suggestions)).toHaveLength(1);
  });
  test("coalesces a typing burst but keeps the correction as its own undo step", () => {
    const state = new EditorState("teh");
    state.apply([edit(first(state.text))]);
    state.edit("the i");
    state.edit("the id", undefined, true);
    state.edit("the idea", undefined, true);
    state.undo();
    expect(state.text).toBe("the");
    state.undo();
    expect(state.text).toBe("teh");
    state.edit("new text");
    expect(state.canRedo).toBe(false);
  });
  test("does not mutate state on stale edit failure", () => {
    const state = new EditorState("hello");
    expect(() => state.apply([edit(first("teh"))])).toThrow();
    expect(state.text).toBe("hello");
    expect(state.canUndo).toBe(false);
  });
  test("does not create a history entry for empty changes", () => {
    const state = new EditorState("hello");
    state.apply([]);
    state.undo();
    expect(state.text).toBe("hello");
    expect(state.canUndo).toBe(false);
  });
  test("keeps the caret aligned across corrections, undo, and redo", () => {
    const state = new EditorState("adress teh");
    const edits = analyze(state.text, { mode: "english", spacing: false }).suggestions.map(edit);
    const previous = { start: 7, end: 10, direction: "backward" } as const;
    const selection = state.apply(edits, previous)!;
    expect(state.text).toBe("address the");
    expect(selection).toEqual({ start: 8, end: 11, direction: "backward" });
    expect(state.undo(selection)).toEqual(previous);
    expect(state.text).toBe("adress teh");
    expect(state.redo(previous)).toEqual(selection);
  });
  test("preserves a caret past the inserted space in a combined batch", () => {
    const state = new EditorState("中teh");
    const selection = state.apply([
      { start: 1, end: 1, original: "", replacement: " " },
      { start: 1, end: 4, original: "teh", replacement: "the" },
    ], { start: 4, end: 4 });
    expect(selection).toMatchObject({ start: 5, end: 5 });
    expect(state.text).toBe("中 the");
  });
  test("bounds the editor text and does not trim corrections", () => {
    const text = "a".repeat(MAX_TEXT_LENGTH - 3) + "teh";
    const state = new EditorState(text);
    expect(() => state.edit(text + "a")).toThrow(RangeError);
    expect(() => state.apply([{ start: MAX_TEXT_LENGTH - 3, end: MAX_TEXT_LENGTH, original: "teh", replacement: "more" }]))
      .toThrow(RangeError);
    expect(state.text).toBe(text);
    expect(state.canUndo).toBe(false);
  });
  test("clear and demo loading are each reversible edits", () => {
    const state = new EditorState("My corrected draft.");
    state.edit("My corrected draft.\n\nA new example.");
    state.edit("");
    state.undo();
    expect(state.text).toBe("My corrected draft.\n\nA new example.");
    state.undo();
    expect(state.text).toBe("My corrected draft.");
  });
});
