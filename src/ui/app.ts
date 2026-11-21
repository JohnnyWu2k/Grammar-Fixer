import { MAX_TEXT_LENGTH, type AnalysisOptions, type Category, type Mode, type Suggestion } from "../core/types";
import { AnalyzerClient } from "./analyzer-client";
import { EditorState } from "./state";

const EXAMPLES = {
  english: "i has teh best idea. This is a apple,adn I definately want to share it.\nWe are ready for the the next step.",
  zhuyin: "su3cl3，rup wu0 wu0fu4 cp3cl3。\nvu,4vu,4su3！",
  mixed: "這個 featre 很好用，我以經開始使用了。\ni has a idea for the next udpate.\nsu3cl3，我們一起測試看看！",
};
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
  const state = new EditorState();
  const analyzer = new AnalyzerClient();
  const source = required<HTMLTextAreaElement>("#source");
  const spacing = required<HTMLInputElement>("#spacing");
  const output = required<HTMLPreElement>("#result");
  const outputEmpty = required("#output-empty");
  const grid = required("#suggestions");
  const empty = required("#suggestions-empty");
  const status = required("#analysis-status");
  const count = required("#suggestion-count");
  const charCount = required("#character-count");
  const appliedCount = required("#applied-count");
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
  let analysisTimer: ReturnType<typeof setTimeout> | undefined;
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;

  function notify(message: string): void {
    clearTimeout(notificationTimer);
    notification.textContent = message;
    notification.hidden = false;
    notificationTimer = setTimeout(() => { notification.hidden = true; }, 3500);
  }

  function renderOutput(): void {
    const text = state.text;
    output.hidden = !text;
    outputEmpty.hidden = Boolean(text);
    output.replaceChildren();
    const ranges = [...state.changes].sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const range of ranges) {
      const start = Math.max(cursor, range.start);
      const end = Math.min(text.length, range.end);
      if (end <= start) continue;
      output.append(document.createTextNode(text.slice(cursor, start)));
      output.append(element("mark", "", text.slice(start, end)));
      cursor = end;
    }
    output.append(document.createTextNode(text.slice(cursor)));
    appliedCount.textContent = state.appliedCount ? `已套用 ${state.appliedCount} 處` : "尚未修改";
    charCount.textContent = `${state.source.length.toLocaleString()} / 10,000`;
    copy.disabled = !text || composing;
    clear.disabled = !state.source;
    undo.disabled = !state.canUndo || composing;
    recheck.disabled = !text || composing;
  }

  function toEdit(suggestion: Suggestion) {
    return {
      start: suggestion.start, end: suggestion.end, original: suggestion.original,
      replacement: selections.get(suggestion.id) ?? suggestion.replacements[0] ?? suggestion.original,
    };
  }

  function apply(suggestion: Suggestion): void {
    if (pending || composing) return;
    try {
      state.apply([toEdit(suggestion)]);
      notify("已套用修正，原文保持不變。");
      refresh(0);
      output.focus({ preventScroll: true });
    } catch {
      notify("文字已更新，正在重新檢查。");
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
    accept.addEventListener("click", () => apply(suggestion));
    actions.append(ignore, accept);
    card.append(actions);
    return card;
  }

  function renderSuggestions(): void {
    grid.setAttribute("aria-busy", String(pending || composing));
    const visible = state.visible(suggestions);
    const high = visible.filter((suggestion) => suggestion.confidence === "high");
    count.textContent = String(visible.length);
    applyHigh.disabled = pending || composing || !high.length;
    applyHigh.textContent = high.length ? `套用高信心建議 (${high.length})` : "套用高信心建議";
    grid.replaceChildren();
    if (!pending && !composing) grid.append(...visible.map(suggestionCard));
    empty.hidden = Boolean(visible.length) && !pending && !composing;
    const emptyMessage = empty.querySelector("p");
    if (composing) {
      status.textContent = "輸入中，組字完成後再檢查。";
      if (emptyMessage) emptyMessage.textContent = "正在等待輸入完成。";
    } else if (pending) {
      status.textContent = "正在本機檢查…";
      if (emptyMessage) emptyMessage.textContent = "整理你的文字中…";
    } else if (!state.text.trim()) {
      status.textContent = "開始輸入，找出可以整理的地方。";
      if (emptyMessage) emptyMessage.textContent = "不急著改變每個字，只修需要修的地方。";
    } else if (visible.length) {
      status.textContent = limited
        ? "先顯示前 80 項建議，套用後可繼續檢查。"
        : `${visible.length} 項建議。候選由你確認，高信心建議可批次套用。`;
    } else {
      status.textContent = limited ? "這批建議已處理完畢。" : "本次檢查完成。";
      if (emptyMessage) emptyMessage.textContent = limited
        ? "原文仍有其他候選，可分段檢查。"
        : options.mode === "zhuyin"
          ? "沒有找到詞庫內的注音候選，原文保持不變。"
          : "目前沒有其他建議。規則校正不代表完整的文法驗證。";
    }
  }

  function refresh(delay = 240): void {
    clearTimeout(analysisTimer);
    const current = ++revision;
    suggestions = [];
    selections.clear();
    limited = false;
    pending = Boolean(state.text.trim()) && !composing;
    renderOutput();
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

  function inputChanged(): void {
    let value = source.value;
    if (value.length > MAX_TEXT_LENGTH) {
      value = value.slice(0, MAX_TEXT_LENGTH).replace(/[\uD800-\uDBFF]$/, "");
      source.value = value;
      notify("已保留前 10,000 字元。");
    }
    state.setSource(value);
    refresh();
  }

  function loadExample(key: keyof typeof EXAMPLES): void {
    if (composing) return;
    source.value = EXAMPLES[key];
    if (key === "english") setMode("english");
    else setMode("auto");
    inputChanged();
    source.focus({ preventScroll: true });
    document.querySelector("#workspace")?.scrollIntoView({ block: "start" });
  }

  function setMode(mode: Mode): void {
    options.mode = mode;
    spacing.disabled = mode === "zhuyin";
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
    state.resetIgnored();
  }

  source.addEventListener("input", inputChanged);
  source.addEventListener("compositionstart", () => {
    composing = true;
    refresh();
  });
  source.addEventListener("compositionend", () => {
    composing = false;
    inputChanged();
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
      if (key && key in EXAMPLES) loadExample(key as keyof typeof EXAMPLES);
    });
  }
  required("#hero-demo").addEventListener("click", () => loadExample("mixed"));
  clear.addEventListener("click", () => {
    if (composing) return;
    source.value = "";
    inputChanged();
    source.focus({ preventScroll: true });
  });
  undo.addEventListener("click", () => {
    if (composing) return;
    state.undo();
    notify("已復原上一批修改。");
    refresh(0);
    output.focus({ preventScroll: true });
  });
  recheck.addEventListener("click", () => {
    state.resetIgnored();
    refresh(0);
  });
  applyHigh.addEventListener("click", () => {
    if (pending || composing) return;
    const high = state.visible(suggestions).filter((suggestion) => suggestion.confidence === "high");
    try {
      state.apply(high.map(toEdit));
      notify(`已套用 ${high.length} 項高信心建議。`);
      refresh(0);
      output.focus({ preventScroll: true });
    } catch {
      notify("文字已更新，正在重新檢查。");
      refresh(0);
    }
  });
  copy.addEventListener("click", () => {
    if (!state.text || composing) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(state.text);
        notify("已複製修正結果。");
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(output);
        selection?.removeAllRanges();
        selection?.addRange(range);
        output.focus();
        notify("已選取結果，可按 Ctrl+C 或使用系統選單複製。");
      }
    })();
  });
  // Respect browser-restored drafts without persisting any text ourselves.
  inputChanged();
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
