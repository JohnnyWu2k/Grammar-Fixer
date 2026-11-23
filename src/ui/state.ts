import { applyEdits } from "../core/edits";
import { overlaps } from "../core/protected";
import { MAX_TEXT_LENGTH, type Edit, type Suggestion, type TextRange } from "../core/types";

type Ignored = Pick<Suggestion, "start" | "end" | "original" | "category">;

export interface EditorSelection extends TextRange {
  direction?: "forward" | "backward" | "none";
}

interface Snapshot {
  text: string;
  selection: EditorSelection;
  ignored: Ignored[];
}

const HISTORY_LIMIT = 50;

function checkLength(text: string): void {
  if (text.length > MAX_TEXT_LENGTH) throw new RangeError("Text is too long.");
}

function atEnd(text: string): EditorSelection {
  return { start: text.length, end: text.length };
}

function getChange(before: string, after: string): Edit {
  let start = 0;
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
  let end = before.length;
  let nextEnd = after.length;
  while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  return { start, end, original: before.slice(start, end), replacement: after.slice(start, nextEnd) };
}

function mapOffset(offset: number, edits: readonly Edit[], bias: "start" | "end"): number {
  let shift = 0;
  for (const edit of edits) {
    if (offset < edit.start || (offset === edit.start && bias === "start")) break;
    if (offset < edit.end) {
      return edit.start + shift + (bias === "end" ? edit.replacement.length : 0);
    }
    shift += edit.replacement.length - (edit.end - edit.start);
  }
  return offset + shift;
}

export class EditorState {
  text: string;
  private ignored: Ignored[] = [];
  private history: Snapshot[] = [];
  private future: Snapshot[] = [];

  constructor(text = "") {
    checkLength(text);
    this.text = text;
  }

  get canUndo(): boolean { return this.history.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  private snapshot(selection: EditorSelection): Snapshot {
    return { text: this.text, selection: { ...selection }, ignored: [...this.ignored] };
  }

  private record(selection: EditorSelection, merge = false): void {
    if (!merge || !this.history.length || this.future.length) {
      this.history.push(this.snapshot(selection));
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    }
    this.future = [];
  }

  private moveIgnored(edits: readonly Edit[]): void {
    this.ignored = this.ignored.filter((ignored) => !edits.some((edit) => overlaps(ignored, edit)))
      .map((ignored) => {
        const shift = edits.filter((edit) => edit.end <= ignored.start)
          .reduce((total, edit) => total + edit.replacement.length - (edit.end - edit.start), 0);
        return { ...ignored, start: ignored.start + shift, end: ignored.end + shift };
      });
  }

  edit(text: string, selection = atEnd(this.text), merge = false): boolean {
    checkLength(text);
    if (text === this.text) return false;
    this.record(selection, merge);
    if (this.ignored.length) this.moveIgnored([getChange(this.text, text)]);
    this.text = text;
    return true;
  }

  visible(suggestions: Suggestion[]): Suggestion[] {
    return suggestions.filter((suggestion) => !this.ignored.some((ignored) =>
      ignored.start === suggestion.start && ignored.end === suggestion.end
      && ignored.original === suggestion.original && ignored.category === suggestion.category));
  }

  ignore(suggestion: Suggestion): void {
    this.ignored.push({
      start: suggestion.start, end: suggestion.end,
      original: suggestion.original, category: suggestion.category,
    });
  }

  resetIgnored(): void { this.ignored = []; }

  apply(edits: readonly Edit[], selection = atEnd(this.text)): EditorSelection | undefined {
    if (!edits.length) return;
    const next = applyEdits(this.text, edits);
    checkLength(next);
    if (next === this.text) return;
    this.record(selection);
    this.moveIgnored(edits);
    this.text = next;
    const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
    return {
      start: mapOffset(selection.start, sorted, selection.start === selection.end ? "end" : "start"),
      end: mapOffset(selection.end, sorted, "end"),
      direction: selection.direction,
    };
  }

  private restore(snapshot: Snapshot): EditorSelection {
    this.text = snapshot.text;
    this.ignored = snapshot.ignored;
    return snapshot.selection;
  }

  undo(selection = atEnd(this.text)): EditorSelection | undefined {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(this.snapshot(selection));
    return this.restore(previous);
  }

  redo(selection = atEnd(this.text)): EditorSelection | undefined {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.snapshot(selection));
    return this.restore(next);
  }
}
