import { describe, expect, test } from "bun:test";
import { decodeZhuyin, toKeys, toPhonetic } from "../../src/core/zhuyin";
import { ZHUYIN_LEXICON } from "../../src/data/zhuyin";

describe("standard Zhuyin keyboard", () => {
  test("converts keyboard symbols in both directions", () => {
    expect(toKeys("ㄋㄧˇ ㄏㄠˇ")).toBe("su3cl3");
    expect(toPhonetic("su3cl3")).toBe("ㄋㄧˇㄏㄠˇ");
  });
  test.each([
    ["su3cl3", "你好"],
    ["sucl", "你好"],
    ["su3 cl3", "你好"],
    ["ji3", "我"],
    ["g4", "是"],
    ["2k7", "的"],
    ["vu,4vu,4", "謝謝"],
    ["vu,4vu,7", "謝謝"],
    ["rupwu0", "今天"],
    ["wu0fu4", "天氣"],
    ["cp3cl3", "很好"],
  ])("recovers %s → %s", (keys, expected) => {
    expect(decodeZhuyin(keys)[0]?.text).toBe(expected);
  });
  test("ranks whole words ahead of isolated character combinations", () => {
    expect(decodeZhuyin("su3cl3")[0]?.text).toBe("你好");
    expect(decodeZhuyin("su3cl3").map((item) => item.text)).toContain("妳好");
  });
  test("does not silently discard explicitly wrong tones", () => {
    expect(decodeZhuyin("su4cl3").map((item) => item.text)).not.toContain("你好");
  });
  test("returns no candidates for invalid or unbounded input", () => {
    expect(decodeZhuyin("%%%%")).toEqual([]);
    expect(decodeZhuyin("s".repeat(81))).toEqual([]);
    expect(decodeZhuyin("")).toEqual([]);
    expect(decodeZhuyin("zzzzzzzzzzzz")).toEqual([]);
  });
  test("validates every authored lexicon entry", () => {
    for (const line of ZHUYIN_LEXICON.trim().split("\n")) {
      const [text, phonetic, frequency] = line.split("|");
      expect(text).toBeTruthy();
      expect(Number(frequency)).toBeGreaterThan(0);
      expect(() => toKeys(phonetic ?? "")).not.toThrow();
      expect(Array.from(text ?? "").length).toBe((phonetic ?? "").split(/\s+/).length);
    }
  });
});
