import { describe, expect, test } from "bun:test";
import { decodeZhuyin, installZhuyinDictionary, toKeys, toPhonetic } from "../../src/core/zhuyin";
import { ZHUYIN_LEXICON } from "../../src/data/zhuyin";

const dictionary = await Bun.file(new URL("../../src/data/mcbopomofo.generated.txt", import.meta.url)).text();
installZhuyinDictionary(dictionary);

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
    ["1l4fu04", "抱歉"],
    ["1l4 fu04", "抱歉"],
    ["1lfu0", "抱歉"],
    ["1l404", "報案"],
    ["１Ｌ４　ＦＵ０４", "抱歉"],
  ])("recovers %s → %s", (keys, expected) => {
    expect(decodeZhuyin(keys)[0]?.text).toBe(expected);
  });
  test("ranks whole words ahead of isolated character combinations", () => {
    expect(decodeZhuyin("su3cl3")[0]?.text).toBe("你好");
    expect(decodeZhuyin("su3cl3").map((item) => item.text)).toContain("妳好");
  });
  test("does not silently discard explicitly wrong tones", () => {
    expect(decodeZhuyin("su4cl3").map((item) => item.text)).not.toContain("你好");
    expect(decodeZhuyin("1l4fu03").map((item) => item.text)).not.toContain("抱歉");
    expect(decodeZhuyin("1l4fu 04").map((item) => item.text)).not.toContain("抱歉");
    expect(decodeZhuyin("u4t.6ai4504").map((item) => item.text)).not.toContain("一籌莫展");
  });
  test("ranks curated idioms as whole words even without the extended dictionary", () => {
    installZhuyinDictionary("");
    try {
      for (const keys of ["u4t.6ai4503", "ut.6ai4503", "u4t.ai50"]) {
        expect(decodeZhuyin(keys)[0]).toMatchObject({ text: "一籌莫展", wordSyllables: 4 });
      }
      expect(decodeZhuyin(toKeys("ㄆㄛˋ ㄅㄨˋ ㄐㄧˊ ㄉㄞˋ"))[0]?.text).toBe("迫不及待");
    } finally {
      installZhuyinDictionary(dictionary);
    }
  });
  test("does not rank the accidental 報七案 split for 抱歉", () => {
    const candidates = decodeZhuyin("1l4fu04");
    expect(candidates[0]?.impliedSplits).toBe(0);
    expect(candidates[0]?.wordSyllables).toBe(2);
    expect(candidates.map((item) => item.text)).not.toContain("報七案");
  });
  test.each([
    ["簽名", "ㄑㄧㄢ ㄇㄧㄥˊ"],
    ["保險", "ㄅㄠˇ ㄒㄧㄢˇ"],
    ["擔心", "ㄉㄢ ㄒㄧㄣ"],
    ["天花板", "ㄊㄧㄢ ㄏㄨㄚ ㄅㄢˇ"],
    ["郵局", "ㄧㄡˊ ㄐㄩˊ"],
    ["記憶體", "ㄐㄧˋ ㄧˋ ㄊㄧˇ"],
  ])("ranks the imported reading for %s", (text, phonetic) => {
    expect(decodeZhuyin(toKeys(phonetic))[0]?.text).toBe(text);
  });
  test("uses a space to distinguish 西安 from the single syllable 先", () => {
    expect(decodeZhuyin("vu0")[0]?.text).toBe("先");
    expect(decodeZhuyin("vu 0")[0]?.text).toBe("西安");
  });
  test("supports uninterrupted sentences beyond the old 80-key limit", () => {
    const text = "抱歉我遲到了".repeat(6);
    const keys = toKeys("ㄅㄠˋ ㄑㄧㄢˋ ㄨㄛˇ ㄔˊ ㄉㄠˋ ㄌㄜ˙".repeat(6));
    expect(keys.length).toBeGreaterThan(80);
    expect(decodeZhuyin(keys)[0]?.text).toBe(text);
  });
  test("returns no candidates for invalid or unbounded input", () => {
    expect(decodeZhuyin("%%%%")).toEqual([]);
    expect(decodeZhuyin("s".repeat(161))).toEqual([]);
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
  test("ships a sizeable, attributed dictionary snapshot", () => {
    const rows = dictionary.trim().split(/\r?\n/).filter((line) => !line.startsWith("#"));
    expect(rows.length).toBeGreaterThan(50_000);
    expect(rows).toContain("1l4 fu04|抱歉|180");
    expect(dictionary).toContain("Mengjuei Hsieh");
  });
});
