export const KEYBOARD: Readonly<Record<string, string>> = {
  "1": "ㄅ", q: "ㄆ", a: "ㄇ", z: "ㄈ", "2": "ㄉ", w: "ㄊ", s: "ㄋ", x: "ㄌ",
  e: "ㄍ", d: "ㄎ", c: "ㄏ", r: "ㄐ", f: "ㄑ", v: "ㄒ",
  "5": "ㄓ", t: "ㄔ", g: "ㄕ", b: "ㄖ", y: "ㄗ", h: "ㄘ", n: "ㄙ",
  u: "ㄧ", j: "ㄨ", m: "ㄩ", "8": "ㄚ", i: "ㄛ", k: "ㄜ", ",": "ㄝ",
  "9": "ㄞ", o: "ㄟ", l: "ㄠ", ".": "ㄡ", "0": "ㄢ", p: "ㄣ",
  ";": "ㄤ", "/": "ㄥ", "-": "ㄦ", "6": "ˊ", "3": "ˇ", "4": "ˋ", "7": "˙",
};
const reverse = new Map(Object.entries(KEYBOARD).map(([key, value]) => [value, key]));

export function isTone(key: string | undefined): boolean {
  return key === "3" || key === "4" || key === "6" || key === "7";
}

export function normalizeKeys(input: string): string {
  // Keep UTF-16 offsets so suggestions always refer to the original text.
  return input.replace(/[\uFF01-\uFF5E\u3000]/g, (character) =>
    character === "\u3000" ? " " : String.fromCharCode(character.charCodeAt(0) - 0xfee0));
}

export function toKeys(phonetic: string): string {
  return Array.from(phonetic.replace(/\s/g, ""), (symbol) => {
    const key = reverse.get(symbol);
    if (!key) throw new Error("Invalid lexicon phonetic symbol.");
    return key;
  }).join("");
}

export function toPhonetic(keys: string): string {
  return Array.from(normalizeKeys(keys).toLowerCase(), (key) => KEYBOARD[key] ?? key).join("");
}

export function syllableKeys(syllable: string): string | undefined {
  const normalized = syllable.replace(/^˙(.+)$/, "$1˙");
  if (!/^(?:[ㄅ-ㄙ]?[ㄧㄨㄩ]?[ㄚ-ㄦ]|[ㄅ-ㄙ]?[ㄧㄨㄩ]|[ㄓ-ㄙ])[ˊˇˋ˙]?$/.test(normalized)) return;
  return toKeys(normalized);
}
