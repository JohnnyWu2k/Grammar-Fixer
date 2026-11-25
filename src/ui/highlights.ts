import type { Suggestion } from "../core/types";
import { placeAnnotations } from "./annotation-layout";

const confidenceName = { high: "高信心", medium: "待確認" };

interface Annotation {
  mark: HTMLElement;
  button: HTMLButtonElement;
  top: number;
}

export function visibleReplacement(text: string): string {
  return text === " " ? "插入空格" : text || "刪除";
}

export class EditorHighlights {
  private items = new Map<string, Annotation>();
  private menuAnchor?: HTMLButtonElement;
  private frame = 0;

  constructor(
    private source: HTMLTextAreaElement,
    private viewport: HTMLElement,
    private content: HTMLElement,
    private labels: HTMLElement,
    private menu: HTMLElement,
    private accept: (suggestion: Suggestion, replacement: string) => void,
  ) {
    source.addEventListener("scroll", () => {
      this.closeMenu();
      this.syncScroll();
    }, { passive: true });
    new ResizeObserver(() => this.queueLayout()).observe(source);
    window.addEventListener("resize", () => this.positionMenu());
    window.addEventListener("scroll", () => this.positionMenu(), { passive: true });
    window.visualViewport?.addEventListener("resize", () => this.positionMenu());
    window.visualViewport?.addEventListener("scroll", () => this.positionMenu());
    document.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Node && this.menuAnchor
        && !this.menu.contains(event.target) && !this.menuAnchor.contains(event.target)) this.closeMenu();
    });
    this.menu.addEventListener("keydown", (event) => this.handleMenuKeys(event));
  }

  render(text: string, suggestions: readonly Suggestion[]): void {
    this.closeMenu();
    this.items.clear();
    const fragment = document.createDocumentFragment();
    const buttons = document.createDocumentFragment();
    let cursor = 0;
    for (const suggestion of suggestions) {
      const { start, end, id, confidence, original, replacements, message } = suggestion;
      if (start < cursor || end > text.length || replacements[0] === undefined) continue;
      fragment.append(text.slice(cursor, start));
      const mark = document.createElement("mark");
      mark.dataset.confidence = confidence;
      if (start === end) mark.classList.add("insertion-mark");
      mark.textContent = text.slice(start, end);
      fragment.append(mark);
      cursor = end;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "inline-fix";
      button.dataset.confidence = confidence;
      const multiple = confidence !== "high" && replacements.length > 1;
      const label = visibleReplacement(replacements[0]);
      const action = multiple ? `查看「${original}」的 ${replacements.length} 個候選` : `套用${original ? `「${original}」→「${label}」` : label}`;
      button.setAttribute("aria-label", `${confidenceLabel(confidence)}：${action}`);
      button.title = `${action}。${message}`;
      button.textContent = label;
      if (multiple) {
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-controls", this.menu.id);
        button.setAttribute("aria-expanded", "false");
        button.classList.add("has-choices");
      }
      button.addEventListener("mousedown", (event) => {
        if (event.button === 0 && document.activeElement === this.source) event.preventDefault();
      });
      button.addEventListener("click", () => {
        if (multiple) this.toggleMenu(button, suggestion);
        else this.accept(suggestion, replacements[0]!);
      });
      button.addEventListener("focus", () => this.scrollTo(this.items.get(id)));
      buttons.append(button);
      this.items.set(id, { mark, button, top: 0 });
    }
    if (this.items.size) {
      fragment.append(text.slice(cursor));
      // Match the editor's extra line box after a trailing newline.
      if (text.endsWith("\n")) fragment.append("\u200b");
    }
    this.content.replaceChildren(fragment);
    this.labels.replaceChildren(buttons);
    this.layout();
  }

  reveal(suggestion: Suggestion): void {
    this.source.focus({ preventScroll: true });
    this.source.setSelectionRange(suggestion.start, suggestion.end);
    this.scrollTo(this.items.get(suggestion.id));
    this.source.scrollIntoView({ block: "nearest" });
  }

  private scrollTo(item: Annotation | undefined): void {
    if (!item) return;
    const top = this.source.scrollTop;
    const bottom = top + this.source.clientHeight;
    if (item.top - 24 < top || item.top + item.button.offsetHeight > bottom) {
      this.source.scrollTop = item.top - this.source.clientHeight / 3;
      this.syncScroll();
    }
  }

  private queueLayout(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.layout();
    });
  }

  private layout(): void {
    const width = this.source.clientWidth;
    this.content.style.width = `${width}px`;
    this.syncScroll();
    if (!this.items.size) return;
    const { top, left } = this.content.getBoundingClientRect();
    const items = [...this.items.values()];
    const anchors = items.map(({ mark }) => {
      // Put a wrapped suggestion below its last visible fragment, not on top
      // of the subsequent lines occupied by the same word.
      const bounds = Array.from(mark.getClientRects()).at(-1) ?? mark.getBoundingClientRect();
      return { x: Math.round(bounds.left - left), y: Math.round(bounds.bottom - top) + 2 };
    });
    const positions = placeAnnotations(anchors, width);
    items.forEach((item, index) => {
      const slot = positions[index]!;
      item.top = slot.y;
      item.button.style.left = `${slot.x}px`;
      item.button.style.top = `${slot.y}px`;
      item.button.style.maxWidth = `${Math.max(1, slot.maxWidth)}px`;
      item.button.classList.toggle("compact", slot.maxWidth < 24);
    });
    this.positionMenu();
  }

  private syncScroll(): void {
    const { scrollTop, scrollLeft } = this.source;
    this.viewport.scrollTop = scrollTop;
    this.viewport.scrollLeft = scrollLeft;
    this.labels.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }

  private toggleMenu(anchor: HTMLButtonElement, suggestion: Suggestion): void {
    if (this.menuAnchor === anchor) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu();
    const heading = document.createElement("p");
    heading.className = "inline-menu-heading";
    heading.textContent = `「${suggestion.original}」的候選`;
    this.menu.replaceChildren(heading);
    for (const replacement of suggestion.replacements) {
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = visibleReplacement(replacement);
      option.addEventListener("click", () => {
        this.closeMenu();
        this.accept(suggestion, replacement);
      });
      this.menu.append(option);
    }
    this.menuAnchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    this.menu.hidden = false;
    if (typeof this.menu.showPopover === "function") this.menu.showPopover();
    this.positionMenu();
    this.menu.querySelector("button")?.focus({ preventScroll: true });
  }

  private positionMenu(): void {
    const anchor = this.menuAnchor;
    if (!anchor) return;
    const visual = window.visualViewport;
    const x = visual?.offsetLeft ?? 0;
    const y = visual?.offsetTop ?? 0;
    const width = visual?.width ?? window.innerWidth;
    const height = visual?.height ?? window.innerHeight;
    const edge = 8;
    const bounds = anchor.getBoundingClientRect();
    if (bounds.bottom <= y || bounds.top >= y + height) {
      this.closeMenu();
      return;
    }
    this.menu.style.maxWidth = `${Math.max(1, width - 2 * edge)}px`;
    this.menu.style.maxHeight = `${Math.max(1, Math.min(272, height - 2 * edge))}px`;
    const left = Math.max(x + edge, Math.min(bounds.left, x + width - edge - this.menu.offsetWidth));
    const below = bounds.bottom + 6;
    const above = bounds.top - 6 - this.menu.offsetHeight;
    const top = below + this.menu.offsetHeight <= y + height - edge ? below : Math.max(y + edge, above);
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
  }

  private closeMenu(refocus = false): void {
    const anchor = this.menuAnchor;
    if (!anchor) return;
    this.menuAnchor = undefined;
    anchor.setAttribute("aria-expanded", "false");
    if (typeof this.menu.hidePopover === "function") this.menu.hidePopover();
    this.menu.hidden = true;
    if (refocus) anchor.focus({ preventScroll: true });
  }

  private handleMenuKeys(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    const buttons = [...this.menu.querySelectorAll("button")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === "Tab" && (event.shiftKey ? index <= 0 : index === buttons.length - 1)) {
      // Return to the trigger so native Tab order continues in the editor.
      this.closeMenu(true);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    }
  }
}

export function confidenceLabel(confidence: Suggestion["confidence"]): string {
  return confidenceName[confidence];
}
