import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/core/analyze";
import { findChineseCorrections, refineChineseCandidate } from "../../src/core/chinese";
import { applyEdits } from "../../src/core/edits";
import { installZhuyinDictionary } from "../../src/core/zhuyin";
import { CHINESE_FIXED_TYPOS, CHINESE_TYPOS } from "../../src/data/chinese";

installZhuyinDictionary(await Bun.file(new URL("../../src/data/mcbopomofo.generated.txt", import.meta.url)).text());

describe("Chinese proofreading", () => {
  test("adds a larger unique phrase dictionary", () => {
    const dictionary = [...CHINESE_FIXED_TYPOS, ...CHINESE_TYPOS];
    expect(dictionary.length).toBeGreaterThanOrEqual(80);
    expect(new Set(dictionary.map(([original]) => original)).size).toBe(dictionary.length);
  });
  test("marks fixed spellings as high while grammar and ambiguous wording remain review-only", () => {
    const text = "teh 文件。進渡報告莫名奇妙，請仔細的檢查。";
    const { suggestions } = analyze(text);
    expect(suggestions.map(({ original, confidence }) => [original, confidence])).toEqual([
      ["teh", "high"], ["進渡報告", "medium"], ["莫名奇妙", "high"], ["的", "medium"],
    ]);
    const green = suggestions.filter(({ confidence }) => confidence === "high").map((suggestion) => ({
      ...suggestion, replacement: suggestion.replacements[0]!,
    }));
    expect(applyEdits(text, green)).toBe("the 文件。進渡報告莫名其妙，請仔細的檢查。");
  });
  test("keeps ordinary phrases, regional forms, and protected examples unchanged", () => {
    for (const text of [
      "可以經由這條路；這些規定可以經理審核。",
      "他在一次會議上發言，提出部份意見。",
      "事情不盡然是這樣，先別下結論。",
      "請仔細的同事檢查資料，並完成資料備份。",
      "`莫名奇妙`、https://example.com/莫名奇妙",
    ]) expect(analyze(text).suggestions.filter((item) => item.category === "chinese")).toEqual([]);
  });
  test("uses contextual grammar patterns instead of global character correction", () => {
    const text = "請在一次確認。寫的很好。是否有沒有更新？大約十分鐘左右。";
    expect(findChineseCorrections(text).map((item) => item.replacements[0]))
      .toEqual(["請再一次", "得", "有", "大約十分鐘"]);
  });
  test("includes a revised candidate but retains the original for optional grammar", () => {
    expect(refineChineseCandidate("這事莫名奇妙，請仔細的檢查。"))
      .toEqual(["這事莫名其妙，請仔細的檢查。", "這事莫名其妙，請仔細地檢查。"]);
  });
  test("runs a Chinese pass on recovered candidates without promoting phonetic guesses to green", () => {
    const suggestion = analyze("u3ru/", { mode: "zhuyin", spacing: false }).suggestions[0];
    expect(suggestion?.original).toBe("u3ru/");
    expect(suggestion?.replacements[0]).toBe("已經");
    expect(suggestion?.message).toContain("已依中文用字規則檢查");
    expect(suggestion?.confidence).toBe("medium");
  });
  test("rechecks the accepted Chinese in Zhuyin-only mode", () => {
    const text = "1l4fu04，請仔細的檢查。";
    const options = { mode: "zhuyin", spacing: false } as const;
    const suggestion = analyze(text, options).suggestions.find((item) => item.category === "zhuyin")!;
    const next = applyEdits(text, [{ ...suggestion, replacement: suggestion.replacements[0]! }]);
    expect(next).toBe("抱歉，請仔細的檢查。");
    expect(analyze(next, options).suggestions).toMatchObject([{ original: "的", replacements: ["地"] }]);
    expect(analyze(next, { mode: "english", spacing: false }).suggestions).toEqual([]);
  });
});
