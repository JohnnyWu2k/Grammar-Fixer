import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/core/analyze";
import { applyEdits } from "../../src/core/edits";
import { oneEditApart, spellingCandidates } from "../../src/core/spelling";
import { MAX_TEXT_LENGTH, type AnalysisOptions } from "../../src/core/types";
import { installZhuyinDictionary } from "../../src/core/zhuyin";
import { mayNeedZhuyinDictionary } from "../../src/core/keyboard-recovery";

installZhuyinDictionary(await Bun.file(
  new URL("../../src/data/mcbopomofo.generated.txt", import.meta.url),
).text());

const english: AnalysisOptions = { mode: "english", spacing: false };
const automatic: AnalysisOptions = { mode: "auto", spacing: false };
const zhuyin: AnalysisOptions = { mode: "zhuyin", spacing: false };
function applyHigh(text: string, options = english): string {
  const result = analyze(text, options);
  return applyEdits(text, result.suggestions.filter((item) => item.confidence === "high")
    .map((item) => ({ ...item, replacement: item.replacements[0] ?? item.original })));
}

describe("English rules", () => {
  test("fixes common misspellings and keeps case", () => {
    expect(applyHigh("Teh adress is definately wrong.")).toBe("The address is definitely wrong.");
  });
  test("fixes independent grammar issues in one batch", () => {
    expect(applyHigh("i has a apple. They is ready. He have a idea."))
      .toBe("I have an apple. They are ready. He has an idea.");
  });
  test("capitalizes contractions without damaging them", () => {
    expect(applyHigh("i'm ready and i've finished.")).toBe("I'm ready and I've finished.");
  });
  test.each([
    ["a hour", "an hour"], ["a honest person", "an honest person"],
    ["an university", "a university"], ["an user", "a user"],
    ["an unique idea", "a unique idea"], ["a unusual idea", "an unusual idea"],
    ["an one time thing", "a one time thing"], ["a MRI", "an MRI"],
    ["an URL", "a URL"],
    ["a NASA project", "a NASA project"],
    ["a RAM module", "a RAM module"], ["a SQL query", "a SQL query"],
    ["a HTML document", "an HTML document"],
  ])("article: %s → %s", (input, expected) => {
    expect(applyHigh(input)).toBe(expected);
  });
  test("does not remove valid repeated had/that or cross paragraphs", () => {
    expect(applyHigh("I had had enough. I knew that that was true.\nthe\nthe"))
      .toBe("I had had enough. I knew that that was true.\nthe\nthe");
    expect(applyHigh("What it is is what it is.")).toBe("What it is is what it is.");
  });
  test("removes accidental repeats and adds punctuation spacing", () => {
    expect(applyHigh("the the idea,please")).toBe("the idea, please");
  });
  test("does not call an unfamiliar name a definite error", () => {
    expect(analyze("Elowen uses TypeScript and Firebase.", english).suggestions).toEqual([]);
  });
  test("offers algorithmic candidates without batch-applying them", () => {
    const result = analyze("hellp", english);
    expect(result.suggestions[0]?.replacements).toContain("hello");
    expect(result.suggestions[0]?.confidence).toBe("medium");
    expect(applyHigh("hellp")).toBe("hellp");
  });
  test("handles an unknown dictionary key without inherited object properties", () => {
    const result = analyze("constructor prototype toString", english);
    expect(result.suggestions.every((item) =>
      item.replacements.every((replacement) => typeof replacement === "string"))).toBe(true);
  });
});

describe("editing distance", () => {
  test.each([
    ["hello", "hello", true], ["hello", "hell", true], ["hell", "hello", true],
    ["hello", "hellp", true], ["world", "wrold", true],
    ["hello", "heppo", false], ["hello", "he", false],
  ])("%s vs %s", (a, b, expected) => {
    expect(oneEditApart(a, b)).toBe(expected);
  });
  test("preserves acronyms and camelCase", () => {
    expect(spellingCandidates("TEH")).toBeUndefined();
    expect(spellingCandidates("someVariable")).toBeUndefined();
  });
});

describe("protected content", () => {
  test.each([
    "https://teh.example.com/recieve",
    "www.teh.example.com",
    "teh@recieve.example",
    "`i has teh`",
    "```\ni has teh\n```",
    "~~~\ni has teh\n~~~",
    "C:\\teh\\recieve.txt",
    "./teh/recieve.txt",
    "some_teh_variable",
    "constVar TEH API TypeScript",
    "@teh #recieve",
    "su3cl3@example.com",
    "https://example.com/su3cl3",
  ])("does not edit %s", (input) => {
    expect(analyze(input, automatic).suggestions).toEqual([]);
  });
  test("still corrects prose around code", () => {
    expect(applyHigh("teh value is `teh`")).toBe("the value is `teh`");
  });
  test("keeps embedded Latin words and accented words intact", () => {
    expect(analyze("naïve café hello123", english).suggestions).toEqual([]);
  });
});

describe("mixed-language analysis", () => {
  test("offers phrase-level Chinese suggestions", () => {
    const result = analyze("我以經完成了，因該沒問題。", automatic);
    expect(result.suggestions.map((item) => item.replacements[0])).toEqual(["已經", "應該"]);
    expect(result.suggestions.every((item) => item.confidence === "medium")).toBe(true);
  });
  test("preserves valid regional variants and ambiguous phrasing", () => {
    expect(analyze("我們在一次會議上見面，這部份包含登入與帳號。", automatic).suggestions).toEqual([]);
  });
  test("adds optional CJK/Latin spacing, including supplementary characters", () => {
    const text = "我用Bun寫TypeScript，𠮷A。";
    expect(applyHigh(text, { ...automatic, spacing: true })).toBe("我用 Bun 寫 TypeScript，𠮷 A。");
    expect(analyze(text, automatic).suggestions).toEqual([]);
  });
  test("keeps Chinese untouched in English mode", () => {
    expect(analyze("我以經完成", english).suggestions).toEqual([]);
  });
  test("keeps English typo rules disabled in Zhuyin mode", () => {
    expect(analyze("i has teh idea", zhuyin).suggestions.every((item) => item.category === "zhuyin")).toBe(true);
  });
  test("recovers keyboard input without guessing a high-confidence correction", () => {
    const item = analyze("su3cl3", automatic).suggestions[0];
    expect(item?.replacements[0]).toBe("你好");
    expect(item?.category).toBe("zhuyin");
    expect(item?.confidence).toBe("medium");
    expect(applyHigh("su3cl3", automatic)).toBe("su3cl3");
  });
  test("preserves punctuation and recovers a spaced sequence", () => {
    const text = "su3 cl3，謝謝！";
    const item = analyze(text, automatic).suggestions[0];
    expect(item?.original).toBe("su3 cl3");
    expect(item?.replacements[0]).toBe("你好");
  });
  test("recovers short toneless sequences when a strongly supported word exists", () => {
    expect(analyze("sucl", automatic).suggestions[0]?.replacements[0]).toBe("你好");
    expect(analyze("sucl", zhuyin).suggestions[0]?.replacements[0]).toBe("你好");
  });
  test("ranks 抱歉 first and hides disconnected character guesses in automatic mode", () => {
    const item = analyze("1l4fu04", automatic).suggestions[0];
    expect(item?.replacements).toEqual(["抱歉"]);
    expect(item?.confidence).toBe("medium");
    expect(applyHigh("1l4fu04", automatic)).toBe("1l4fu04");
  });
  test("detects lowercase, uppercase and full-width keyboard input", () => {
    for (const text of ["1l4fu04", "1L4FU04", "１ｌ４ＦＵ０４", "1lfu0"]) {
      const item = analyze(`👋${text}。`, automatic).suggestions[0];
      expect([item?.start, item?.end]).toEqual([2, 2 + text.length]);
      expect(item?.original).toBe(text);
      expect(item?.replacements[0]).toBe("抱歉");
    }
  });
  test("preserves actual punctuation without losing the comma inside Zhuyin", () => {
    const suggestions = analyze("vu,4vu,4,1l4fu04;su3cl3.", automatic).suggestions;
    expect(suggestions.map((item) => item.original)).toEqual(["vu,4vu,4", "1l4fu04", "su3cl3"]);
    expect(suggestions.map((item) => item.replacements[0])).toEqual(["謝謝", "抱歉", "你好"]);
  });
  test("handles long phrases across first-tone spaces", () => {
    expect(analyze("rup wu0 wu0fu4 cp3cl3", automatic).suggestions[0]?.replacements[0])
      .toBe("今天天氣很好");
  });
  test("leaves numbers, product IDs and English suffixes unchanged", () => {
    const suggestions = analyze("2026-11-23 XJ-3467 M4 iPhone15 v1.2.3 1234 su3cl3hello", automatic).suggestions;
    expect(suggestions.map((item) => item.original)).toEqual(["su3cl3"]);
    expect(suggestions[0]?.replacements[0]).toBe("你好");
  });
  test("leaves a single key alone automatically but provides candidates in manual mode", () => {
    expect(analyze("u", automatic).suggestions).toEqual([]);
    expect(analyze("u", zhuyin).suggestions[0]?.replacements).toContain("一");
  });
  test("uses the smaller bundle when only English analysis or known words are needed", () => {
    expect(mayNeedZhuyinDictionary("1l4fu04", "english")).toBe(false);
    expect(mayNeedZhuyinDictionary("hello world, 2026-11-23", "auto")).toBe(false);
    expect(mayNeedZhuyinDictionary("今天要開會", "auto")).toBe(false);
    expect(mayNeedZhuyinDictionary("１Ｌ４ＦＵ０４", "auto")).toBe(true);
  });
  test("does not interpret known English words as keyboard errors automatically", () => {
    expect(analyze("go to the office today", automatic).suggestions).toEqual([]);
  });
  test("does not mix English corrections into an IME recovery range", () => {
    const result = analyze("su3cl3，teh idea", automatic).suggestions;
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.category)).toEqual(["zhuyin", "spelling"]);
  });
});

describe("analysis bounds", () => {
  test("handles empty text", () => {
    expect(analyze("")).toEqual({ suggestions: [], limited: false });
  });
  test("limits suggestions without producing overlapping edits", () => {
    const text = "teh ".repeat(200);
    const result = analyze(text, english);
    expect(result.suggestions).toHaveLength(80);
    expect(result.limited).toBe(true);
    expect(() => applyHigh(text)).not.toThrow();
  });
  test("rejects oversized input and invalid modes", () => {
    expect(() => analyze("a".repeat(MAX_TEXT_LENGTH + 1))).toThrow();
    expect(() => analyze("hello", { mode: "invalid", spacing: false } as unknown as AnalysisOptions)).toThrow();
  });
  test("does not split or misplace UTF-16 offsets after an emoji", () => {
    const text = "👋 teh idea";
    const item = analyze(text, english).suggestions[0];
    expect(item?.start).toBe(3);
    expect(applyHigh(text)).toBe("👋 the idea");
  });
  test("can reanalyze a corrected result that grew beyond the draft limit", () => {
    const text = "中A".repeat(5000);
    const result = applyHigh(text, { ...automatic, spacing: true });
    expect(result.length).toBeGreaterThan(10_000);
    expect(() => analyze(result)).not.toThrow();
  });
});
