import { ZHUYIN_LEXICON } from "../data/zhuyin";

export const KEYBOARD: Readonly<Record<string, string>> = {
  "1": "ㄅ", q: "ㄆ", a: "ㄇ", z: "ㄈ", "2": "ㄉ", w: "ㄊ", s: "ㄋ", x: "ㄌ",
  e: "ㄍ", d: "ㄎ", c: "ㄏ", r: "ㄐ", f: "ㄑ", v: "ㄒ",
  "5": "ㄓ", t: "ㄔ", g: "ㄕ", b: "ㄖ", y: "ㄗ", h: "ㄘ", n: "ㄙ",
  u: "ㄧ", j: "ㄨ", m: "ㄩ", "8": "ㄚ", i: "ㄛ", k: "ㄜ", ",": "ㄝ",
  "9": "ㄞ", o: "ㄟ", l: "ㄠ", ".": "ㄡ", "0": "ㄢ", p: "ㄣ",
  ";": "ㄤ", "/": "ㄥ", "-": "ㄦ", "6": "ˊ", "3": "ˇ", "4": "ˋ", "7": "˙",
};
const reverseKeyboard = new Map(Object.entries(KEYBOARD).map(([key, value]) => [value, key]));
const tones = new Set(["3", "4", "6", "7"]);
const BEAM_WIDTH = 8;

interface Entry {
  text: string;
  syllables: number;
  frequency: number;
}

interface Trie {
  children: Map<string, Trie>;
  entries: Entry[];
}

export interface ZhuyinCandidate {
  text: string;
  score: number;
  syllables: number;
}

let root: Trie | undefined;
const cache = new Map<string, ZhuyinCandidate[]>();

export function toKeys(phonetic: string): string {
  return Array.from(phonetic.replace(/\s/g, ""), (symbol) => {
    const key = reverseKeyboard.get(symbol);
    if (!key) throw new Error("Invalid lexicon phonetic symbol.");
    return key;
  }).join("");
}

export function toPhonetic(keys: string): string {
  return Array.from(keys.toLowerCase(), (key) => KEYBOARD[key] ?? key).join("");
}

function buildTrie(): Trie {
  const trie: Trie = { children: new Map(), entries: [] };
  const entries = new Map<string, Entry & { keys: string }>();
  const add = (text: string, phonetic: string, frequency: number, syllables: number) => {
    const keys = toKeys(phonetic);
    const identity = `${keys}:${text}`;
    const previous = entries.get(identity);
    if (!previous || previous.frequency < frequency) {
      entries.set(identity, { text, keys, frequency, syllables });
    }
  };

  for (const line of ZHUYIN_LEXICON.trim().split("\n")) {
    const [text, phonetic, frequencyText] = line.split("|");
    if (!text || !phonetic || !frequencyText) throw new Error("Invalid lexicon entry.");
    const frequency = Number(frequencyText);
    const syllables = phonetic.trim().split(/\s+/);
    add(text, phonetic, frequency, syllables.length);
    const characters = Array.from(text);
    if (characters.length === syllables.length) {
      characters.forEach((character, i) => {
        const syllable = syllables[i];
        if (syllable) add(character, syllable, Math.max(10, frequency / 12), 1);
      });
    }
  }

  for (const entry of entries.values()) {
    let node = trie;
    for (const key of entry.keys) {
      let next = node.children.get(key);
      if (!next) {
        next = { children: new Map(), entries: [] };
        node.children.set(key, next);
      }
      node = next;
    }
    node.entries.push(entry);
  }
  return trie;
}

interface Match {
  end: number;
  entry: Entry;
  missingTones: number;
}

function matchesAt(input: string, start: number, trie: Trie): Match[] {
  const matches: Match[] = [];
  const stack = [{ node: trie, position: start, missingTones: 0 }];
  let visited = 0;
  while (stack.length && visited++ < 4096) {
    const state = stack.pop();
    if (!state) break;
    if (state.position > start) {
      for (const entry of state.node.entries) {
        matches.push({ end: state.position, entry, missingTones: state.missingTones });
      }
    }
    for (const [key, node] of state.node.children) {
      if (input[state.position] === key) {
        stack.push({ node, position: state.position + 1, missingTones: state.missingTones });
      } else if (tones.has(key) && !tones.has(input[state.position] ?? "")) {
        // Missing tones are tolerated; explicitly wrong tones are not.
        stack.push({ node, position: state.position, missingTones: state.missingTones + 1 });
      }
    }
  }
  return matches;
}

export function decodeZhuyin(keys: string): ZhuyinCandidate[] {
  const input = keys.toLowerCase().replace(/[ \t]/g, "");
  if (!input || input.length > 80 || Array.from(input).some((key) => !KEYBOARD[key])) return [];
  const cached = cache.get(input);
  if (cached) return cached;
  root ??= buildTrie();
  const states = new Map<number, ZhuyinCandidate[]>([
    [0, [{ text: "", score: 0, syllables: 0 }]],
  ]);
  for (let position = 0; position < input.length; position++) {
    const previous = states.get(position);
    if (!previous) continue;
    for (const match of matchesAt(input, position, root)) {
      const candidates = states.get(match.end) ?? [];
      for (const prefix of previous) {
        candidates.push({
          text: prefix.text + match.entry.text,
          score: prefix.score + Math.log1p(match.entry.frequency)
            + (match.entry.syllables - 1) * 5 - 6 - match.missingTones * 1.25,
          syllables: prefix.syllables + match.entry.syllables,
        });
      }
      const best = new Map<string, ZhuyinCandidate>();
      for (const candidate of candidates) {
        if (candidate.score > (best.get(candidate.text)?.score ?? -Infinity)) {
          best.set(candidate.text, candidate);
        }
      }
      states.set(match.end, Array.from(best.values())
        .sort((a, b) => b.score - a.score).slice(0, BEAM_WIDTH));
    }
  }
  const result = (states.get(input.length) ?? []).slice(0, 3);
  if (cache.size >= 256) cache.clear();
  cache.set(input, result);
  return result;
}
