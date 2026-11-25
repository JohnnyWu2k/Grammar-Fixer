import { describe, expect, test } from "bun:test";
import { placeAnnotations } from "../../src/ui/annotation-layout";

describe("inline annotation slots", () => {
  test("puts suggestions directly under their source text when space allows", () => {
    expect(placeAnnotations([{ x: 22, y: 41 }, { x: 96, y: 41 }], 400)).toEqual([
      { x: 22, y: 41, maxWidth: 70 }, { x: 96, y: 41, maxWidth: 216 },
    ]);
  });
  test("prevents adjacent suggestions from overlapping and clamps them to the editor", () => {
    const slots = placeAnnotations([{ x: 250, y: 45 }, { x: 261, y: 45 }, { x: 279, y: 45 }], 280);
    expect(slots.every(({ x, maxWidth }) => x >= 4 && x + maxWidth <= 276.0001)).toBe(true);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i - 1]!.x + slots[i - 1]!.maxWidth).toBeLessThan(slots[i]!.x);
    }
  });
  test("allows annotations at the same horizontal position on different lines", () => {
    const slots = placeAnnotations([{ x: 18, y: 40 }, { x: 18, y: 92 }], 280);
    expect(slots.map(({ x }) => x)).toEqual([18, 18]);
  });
});
