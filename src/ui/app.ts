import { MAX_TEXT_LENGTH, type AnalysisOptions, type Category, type Edit, type Mode, type Suggestion } from "../core/types";
import { AnalyzerClient } from "./analyzer-client";
import { createExampleGenerator, type ExampleChoice } from "./examples";
import { EditorState, type EditorSelection } from "./state";

const LABELS: Record<Category, string> = {
  spelling: "英文拼字", grammar: "基本文法", chinese: "中文用字",
  zhuyin: "輸入法還原", spacing: "文字間距",
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = "", text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function required<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing interface element: ${selector}`);
  return node;
}

function visibleText(text: string): string {
  return text === "" ? "缺少空格" : text === " " ? "空格" : text;
}

export function mountApp(): void {
  const source = required<HTMLTextAreaElement>("#source");
  const fit = (text: string) => text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH).replace(/[\uD800-\uDBFF]$/, "") : text;
  source.maxLength = MAX_TEXT_LENGTH;
  const state = new EditorState(fit(source.value));
  const analyzer = new AnalyzerClient();
  const nextExample = createExampleGenerator();
  const formatCount = new Intl.NumberFormat("en-US");
  const characterLimit = formatCount.format(MAX_TEXT_LENGTH);
  const spacing = required<HTMLInputElement>("#spacing");
  const grid = required("#suggestions");
  const status = required("#analysis-status");
  const count = required("#suggestion-count");
  const charCount = required("#character-count");
  const clear = required<HTMLButtonElement>("#clear");
  const copy = required<HTMLButtonElement>("#copy");
  const undo = required<HTMLButtonElement>("#undo");
  const recheck = required<HTMLButtonElement>("#recheck");
  const applyHigh = required<HTMLButtonElement>("#apply-high");
  const notification = required("#notification");
  const options: AnalysisOptions = { mode: "auto", spacing: false };
  const selections = new Map<string, string>();
  let suggestions: Suggestion[] = [];
  let limited = false;
  let pending = false;
  let revision = 0;
  let composing = false;
  let compositionSelection: EditorSelection | undefined;
  let selectionBeforeInput: EditorSelection | undefined;
  let typing: { kind: string; time: number; after: EditorSelection } | undefined;
  let sample: { prefix: string; text: string } | undefined;
  let analysisTimer: ReturnType<typeof setTimeout> | undefined;
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;

  function notify(message: string): void {
    clearTimeout(notificationTimer);
    notification.textContent = message;
    notification.hidden = false;
    notificationTimer = setTimeout(() => { notification.hidden = true; }, 3500);
  }

  function readSelection(): EditorSelection {
    return { start: source.selectionStart, end: source.selectionEnd, direction: source.selectionDirection };
  }

  function updateEditor(selection?: EditorSelection, reveal = true): void {
    const { scrollTop, scrollLeft } = source;
    if (source.value !== state.text) source.value = state.text;
    if (selection) {
      source.focus({ preventScroll: true });
      source.setSelectionRange(selection.start, selection.end, selection.direction);
    }
    source.scrollTop = scrollTop;
    source.scrollLeft = scrollLeft;
    if (selection && reveal) {
      const { top, bottom } = source.getBoundingClientRect();
      if (bottom <= 0 || top >= window.innerHeight) source.scrollIntoView({ block: "nearest" });
    }
  }

  function renderEditorControls(): void {
    const length = source.value.length;
    charCount.textContent = `${formatCount.format(length)} / ${characterLimit}`;
    copy.disabled = !length || composing;
    clear.disabled = !length || composing;
    undo.disabled = !state.canUndo || composing;
    recheck.disabled = !length || composing;
  }

  function toEdit(suggestion: Suggestion) {
    return {
      start: suggestion.start, end: suggestion.end, original: suggestion.original,
      replacement: selections.get(suggestion.id) ?? suggestion.replacements[0] ?? suggestion.original,
    };
  }

  function apply(edits: Edit[]): void {
    if (pending || composing) return;
    try {
      const selection = state.apply(edits, readSelection());
      if (!selection) return;
      typing = undefined;
      updateEditor(selection);
      notify(`已套用 ${edits.length} 項修正。`);
      refresh(0);
    } catch (error) {
      notify(error instanceof RangeError ? "修正後會超過字元上限。" : "文字已更新，正在重新檢查。");
      refresh(0);
    }
  }

  function suggestionCard(suggestion: Suggestion): HTMLElement {
    const card = element("article", "suggestion-card");
    card.dataset.category = suggestion.category;
    const top = element("div", "suggestion-top");
    top.append(element("span", "category-label", LABELS[suggestion.category]));
    top.append(element("span", "confidence-label", suggestion.confidence === "high" ? "高信心" : "候選建議"));
    const edit = element("p", "suggestion-edit");
    edit.append(element("del", "suggestion-original", visibleText(suggestion.original)));
    const arrow = element("span", "suggestion-arrow", "→");
    arrow.setAttribute("aria-hidden", "true");
    const replacement = selections.get(suggestion.id) ?? suggestion.replacements[0] ?? "";
    edit.append(arrow, element("span", "suggestion-replacement", visibleText(replacement)));
    const contextStart = Math.max(0, suggestion.start - 16);
    const contextEnd = Math.min(state.text.length, suggestion.end + 16);
    const context = `${contextStart > 0 ? "…" : ""}${state.text.slice(contextStart, contextEnd)}${contextEnd < state.text.length ? "…" : ""}`;
    card.append(top, edit, element("p", "suggestion-context", context),
      element("p", "suggestion-message", suggestion.message));
    if (suggestion.replacements.length > 1) {
      const candidates = element("div", "candidate-options");
      candidates.setAttribute("role", "group");
      candidates.setAttribute("aria-label", `${suggestion.original} 的候選字`);
      for (const candidate of suggestion.replacements) {
        const button = element("button", "", candidate);
        button.type = "button";
        button.setAttribute("aria-pressed", String(candidate === replacement));
        button.addEventListener("click", () => {
          selections.set(suggestion.id, candidate);
          for (const item of candidates.querySelectorAll("button")) {
            item.setAttribute("aria-pressed", String(item === button));
          }
          const label = edit.querySelector(".suggestion-replacement");
          if (label) label.textContent = visibleText(candidate);
        });
        candidates.append(button);
      }
      card.append(candidates);
    }
    const actions = element("div", "suggestion-actions");
    const ignore = element("button", "quiet-button", "忽略");
    ignore.type = "button";
    ignore.addEventListener("click", () => {
      state.ignore(suggestion);
      renderSuggestions();
      (grid.querySelector<HTMLButtonElement>("button") ?? recheck).focus({ preventScroll: true });
    });
    const accept = element("button", "suggestion-apply", "套用");
    accept.type = "button";
    accept.setAttribute("aria-label", `套用「${suggestion.original || "中英間距"}」的修正`);
    accept.addEventListener("click", () => apply([toEdit(suggestion)]));
    actions.append(ignore, accept);
    card.append(actions);
    return card;
  }

  function renderSuggestions(): void {
    const busy = pending || composing;
    grid.setAttribute("aria-busy", String(busy));
    grid.inert = busy;
    if (busy) {
      applyHigh.disabled = true;
      status.textContent = composing ? "輸入法組字中" : "檢查中…";
      return;
    }
    const visible = state.visible(suggestions);
    const high = visible.filter((suggestion) => suggestion.confidence === "high");
    count.textContent = String(visible.length);
    applyHigh.disabled = !high.length;
    applyHigh.textContent = high.length ? `套用高信心建議 (${high.length})` : "套用高信心建議";
    grid.replaceChildren(...visible.map(suggestionCard));
    status.textContent = !state.text.trim() ? "等待輸入"
      : limited ? "建議過多，顯示前 80 項"
        : visible.length ? "選擇要套用的建議" : "目前沒有建議";
  }

  function refresh(delay = 240): void {
    clearTimeout(analysisTimer);
    const current = ++revision;
    suggestions = [];
    selections.clear();
    limited = false;
    pending = Boolean(state.text.trim()) && !composing;
    renderEditorControls();
    renderSuggestions();
    if (!pending) return;
    analysisTimer = setTimeout(() => {
      void analyzer.analyze(state.text, { ...options }).then((result) => {
        if (current !== revision) return;
        suggestions = result.suggestions;
        limited = result.limited;
        pending = false;
        renderSuggestions();
      }).catch(() => {
        if (current !== revision) return;
        pending = false;
        renderSuggestions();
        status.textContent = "無法完成檢查，可使用「重新檢查」再試一次。";
      });
    }, delay);
  }

  function inputChanged(kind = "", before = selectionBeforeInput): void {
    selectionBeforeInput = undefined;
    const value = fit(source.value);
    if (value !== source.value) {
      source.value = value;
      notify("已保留字元上限以內的內容。");
    }
    const time = performance.now();
    const joinsTyping = /^(insertText|deleteContentBackward|deleteContentForward)$/.test(kind);
    const merge = Boolean(joinsTyping && before && typing && typing.kind === kind && time - typing.time < 800
      && before.start === before.end && before.start === typing.after.start && before.end === typing.after.end);
    if (!state.edit(value, before, merge)) return;
    typing = joinsTyping ? { kind, time, after: readSelection() } : undefined;
    refresh();
  }

  function loadExample(choice: ExampleChoice): void {
    if (composing) return;
    const example = nextExample(choice);
    const previousSample = sample && state.text === sample.prefix + sample.text ? sample : undefined;
    const prefix = previousSample?.prefix
      ?? (state.text ? state.text + (state.text.endsWith("\n") ? "\n" : "\n\n") : "");
    const text = prefix + example.text;
    if (text.length > MAX_TEXT_LENGTH) {
      notify("空間不足，未加入範例。");
      return;
    }
    typing = undefined;
    state.edit(text, readSelection());
    sample = { prefix, text: example.text };
    setMode(prefix ? "auto" : example.mode);
    const end = text.length;
    updateEditor({ start: end, end }, choice !== "random");
    source.scrollTop = source.scrollHeight;
    refresh(0);
    if (prefix && !previousSample) notify("範例已附加在文末。");
    if (choice === "random") {
      document.querySelector("#workspace")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
  }

  function restore(direction: "undo" | "redo"): void {
    if (composing) return;
    const selection = state[direction](readSelection());
    if (!selection) return;
    typing = undefined;
    updateEditor(selection);
    refresh(0);
    notify(direction === "undo" ? "已復原上一步。" : "已重做上一步。");
  }

  function setMode(mode: Mode): void {
    if (options.mode !== mode) state.resetIgnored();
    options.mode = mode;
    spacing.disabled = mode === "zhuyin";
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
  }

  source.addEventListener("beforeinput", (event) => {
    if (composing || event.isComposing) return;
    if (event.cancelable && (event.inputType === "historyUndo" || event.inputType === "historyRedo")) {
      event.preventDefault();
      restore(event.inputType === "historyUndo" ? "undo" : "redo");
      return;
    }
    selectionBeforeInput = readSelection();
  });
  source.addEventListener("keydown", (event) => {
    if (composing || event.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    restore(key === "y" || event.shiftKey ? "redo" : "undo");
  });
  source.addEventListener("input", (event) => {
    const edit = event as InputEvent;
    if (composing || edit.isComposing) renderEditorControls();
    else inputChanged(edit.inputType);
  });
  source.addEventListener("compositionstart", () => {
    compositionSelection = readSelection();
    typing = undefined;
    composing = true;
    refresh();
  });
  source.addEventListener("compositionend", () => {
    composing = false;
    const before = compositionSelection;
    compositionSelection = undefined;
    if (source.value === state.text) refresh();
    else inputChanged("", before);
  });
  spacing.addEventListener("change", () => {
    options.spacing = spacing.checked;
    state.resetIgnored();
    refresh(0);
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (composing || !["auto", "english", "zhuyin"].includes(mode ?? "")) return;
      setMode(mode as Mode);
      refresh(0);
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-example]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.example;
      if (key === "random" || key === "english" || key === "zhuyin" || key === "mixed") loadExample(key);
    });
  }
  clear.addEventListener("click", () => {
    if (composing) return;
    typing = undefined;
    state.edit("", readSelection());
    updateEditor({ start: 0, end: 0 });
    refresh(0);
  });
  undo.addEventListener("click", () => restore("undo"));
  recheck.addEventListener("click", () => {
    state.resetIgnored();
    refresh(0);
  });
  applyHigh.addEventListener("click", () => {
    if (pending || composing) return;
    const high = state.visible(suggestions).filter((suggestion) => suggestion.confidence === "high");
    apply(high.map(toEdit));
  });
  copy.addEventListener("click", () => {
    if (!state.text || composing) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(state.text);
        notify("已複製文字。");
      } catch {
        source.focus({ preventScroll: true });
        source.select();
        notify("已選取文字，可使用系統複製。");
      }
    })();
  });
  // Respect browser-restored drafts without persisting any text ourselves.
  updateEditor();
  refresh();
  window.addEventListener("pagehide", () => {
    clearTimeout(analysisTimer);
    clearTimeout(notificationTimer);
    revision++;
    notification.hidden = true;
    analyzer.dispose();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refresh(0);
  });
}
