import { applyEdits } from "../core/edits";
import { overlaps } from "../core/protected";
import { MAX_TEXT_LENGTH, MAX_RESULT_LENGTH, type Edit, type Suggestion, type TextRange } from "../core/types";

type Ignored = Pick<Suggestion, "start" | "end" | "original" | "category">;
interface Snapshot {
  text: string;
  ignored: Ignored[];
  appliedCount: number;
  changes: TextRange[];
}

export class EditorState {
  source = "";
  text = "";
  appliedCount = 0;
  changes: TextRange[] = [];
  private ignored: Ignored[] = [];
  private history: Snapshot[] = [];

  get canUndo(): boolean { return this.history.length > 0; }

  setSource(text: string): void {
    if (text.length > MAX_TEXT_LENGTH) throw new Error("Text is too long.");
    this.source = text;
    this.text = text;
    this.appliedCount = 0;
    this.ignored = [];
    this.history = [];
    this.changes = [];
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

  apply(edits: Edit[]): void {
    if (!edits.length) return;
    const next = applyEdits(this.text, edits);
    if (next.length > MAX_RESULT_LENGTH) throw new Error("Result is too long.");
    if (next === this.text) return;
    this.history.push({
      text: this.text,
      ignored: this.ignored.map((ignored) => ({ ...ignored })),
      appliedCount: this.appliedCount,
      changes: this.changes.map((change) => ({ ...change })),
    });
    if (this.history.length > 50) this.history.shift();
    const shiftBefore = (position: number) => edits.filter((edit) => edit.end <= position)
      .reduce((total, edit) => total + edit.replacement.length - (edit.end - edit.start), 0);
    this.changes = this.changes.filter((change) => !edits.some((edit) => overlaps(change, edit)))
      .map((change) => ({
        start: change.start + shiftBefore(change.start),
        end: change.end + shiftBefore(change.end),
      }));
    let delta = 0;
    for (const edit of [...edits].sort((a, b) => a.start - b.start || a.end - b.end)) {
      if (edit.replacement) this.changes.push({
        start: edit.start + delta, end: edit.start + delta + edit.replacement.length,
      });
      delta += edit.replacement.length - (edit.end - edit.start);
    }
    this.ignored = this.ignored.filter((ignored) => !edits.some((edit) => overlaps(ignored, edit)))
      .map((ignored) => {
        const shift = edits.filter((edit) => edit.end <= ignored.start)
          .reduce((total, edit) => total + edit.replacement.length - (edit.end - edit.start), 0);
        return { ...ignored, start: ignored.start + shift, end: ignored.end + shift };
      });
    this.text = next;
    this.appliedCount += edits.length;
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.text = previous.text;
    this.ignored = previous.ignored;
    this.appliedCount = previous.appliedCount;
    this.changes = previous.changes;
  }
}
