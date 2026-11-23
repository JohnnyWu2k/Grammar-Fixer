import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/core/analyze";
import { installZhuyinDictionary } from "../../src/core/zhuyin";
import { createExampleGenerator } from "../../src/ui/examples";

installZhuyinDictionary(await Bun.file(new URL("../../src/data/mcbopomofo.generated.txt", import.meta.url)).text());

describe("local example generator", () => {
  test("chooses distinct examples before cycling, with all three modes represented", () => {
    const next = createExampleGenerator(() => 0.42);
    const samples = Array.from({ length: 142 }, () => next("random"));
    expect(new Set(samples.map((sample) => sample.text)).size).toBe(samples.length);
    expect(new Set(samples.map((sample) => sample.kind))).toEqual(new Set(["english", "zhuyin", "mixed"]));
    expect(next("random").text).not.toBe(samples.at(-1)?.text);
  });

  test("keeps changing the example even when switching categories or exhausting a bag", () => {
    const next = createExampleGenerator(() => 0);
    let previous = "";
    for (const choice of ["random", ...Array<"mixed">(40).fill("mixed"), "random", "zhuyin", "english"] as const) {
      const current = next(choice);
      expect(current.text).not.toBe(previous);
      previous = current.text;
    }
  });

  test("every generated example exercises the expected correction mode", () => {
    const next = createExampleGenerator(() => 0.8);
    for (let i = 0; i < 142; i++) {
      const { text, kind, mode } = next("random");
      const categories = analyze(text, { mode, spacing: false }).suggestions.map((suggestion) => suggestion.category);
      if (kind === "english") expect(categories).toContain("spelling");
      else if (kind === "zhuyin") expect(categories.filter((category) => category === "zhuyin").length).toBe(2);
      else {
        expect(categories).toContain("spelling");
        expect(categories).toContain("zhuyin");
      }
    }
  });
});
