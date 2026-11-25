import { ZHUYIN_LEXICON } from "../data/zhuyin";
import { isTone, normalizeKeys, syllableKeys } from "./zhuyin-keys";

export { toKeys, toPhonetic } from "./zhuyin-keys";

const MAX_KEYS = 160;
const MAX_WORD_SYLLABLES = 8;
const BEAM_WIDTH = 12;
const CACHE_LIMIT = 384;

interface Entry {
  text: string;
  tones: string;
  frequency: number;
  score: number;
}

interface Trie {
  children: Map<string, Trie>;
  entries: Entry[];
}

interface Lexicon {
  root: Trie;
  syllables: Set<string>;
}

export interface ZhuyinCandidate {
  text: string;
  score: number;
  syllables: number;
  wordSyllables: number;
  trailingWordSyllables: number;
  strongestWord: number;
  missingTones: number;
  impliedSplits: number;
}

let lexicon: Lexicon | undefined;
const cache = new Map<string, ZhuyinCandidate[]>();

export function installZhuyinDictionary(data: string): void {
  lexicon = buildLexicon(data);
  cache.clear();
}

function buildLexicon(data = ""): Lexicon {
  const root: Trie = { children: new Map(), entries: [] };
  const syllables = new Set<string>();
  function add(text: string, keys: string[], frequency: number, curated = false): void {
    let node = root;
    let tones = "";
    for (const key of keys) {
      const last = key.at(-1);
      const marked = isTone(last);
      const base = marked ? key.slice(0, -1) : key;
      tones += marked ? last ?? "0" : "0";
      syllables.add(base);
      let next = node.children.get(base);
      if (!next) {
        next = { children: new Map(), entries: [] };
        node.children.set(base, next);
      }
      node = next;
    }
    // Log occurrence counts with a token cost make unattested character-by-character
    // readings less attractive than whole words without overwhelming explicit tones.
    const score = Math.log10(1 + frequency) - 6.8
      + (keys.length - 1) * 0.62 + (curated ? 1.3 : 0);
    const index = node.entries.findIndex((entry) => entry.text === text && entry.tones === tones);
    const entry = { text, tones, frequency, score };
    const previous = node.entries[index];
    if (!previous) node.entries.push(entry);
    else if (score > previous.score) node.entries[index] = entry;
  }
  for (const line of data.trim().split(/\r?\n/)) {
    if (line.startsWith("#")) continue;
    const [reading, text, count] = line.split("|");
    if (reading && text && count) add(text, reading.split(" "), Number(count));
  }
  for (const line of ZHUYIN_LEXICON.trim().split(/\r?\n/)) {
    const [text, phonetic, weight] = line.split("|");
    if (!text || !phonetic || !weight) throw new Error("Invalid curated lexicon entry.");
    const keys = phonetic.split(/\s+/).map((syllable) => {
      const key = syllableKeys(syllable);
      if (!key) throw new Error("Invalid curated syllable.");
      return key;
    });
    const frequency = Number(weight);
    add(text, keys, frequency * (keys.length === 1 ? 25 : 4), true);
    if (!data && keys.length > 1) Array.from(text).forEach((character, i) => {
      const key = keys[i];
      if (key) add(character, [key], Math.max(5, frequency / 10));
    });
  }
  return { root, syllables };
}

interface Syllable {
  base: string;
  tone: string;
  end: number;
  impliedSplit: boolean;
}

function syllablesAt(input: string, start: number, inventory: Set<string>): Syllable[] {
  const edges: Syllable[] = [];
  let longest = start;
  for (let end = start + 1; end <= Math.min(start + 3, input.length); end++) {
    if (isTone(input[end - 1]) || input[end - 1] === " ") break;
    const base = input.slice(start, end);
    if (!inventory.has(base)) continue;
    longest = end;
    const hasTone = isTone(input[end]);
    const next = end + Number(hasTone);
    edges.push({
      base,
      tone: hasTone ? input[end] ?? "" : "",
      end: next + Number(input[next] === " "),
      impliedSplit: false,
    });
  }
  // E.g. fu0 is ㄑㄧㄢ; reading fu + 0 without a tone/space is possible,
  // but less plausible than keeping the intact syllable.
  for (const edge of edges) {
    edge.impliedSplit = !edge.tone && edge.end < longest && input[edge.end - 1] !== " ";
  }
  return edges;
}

interface WordMatch {
  entry: Entry;
  end: number;
  length: number;
  missingTones: number;
  splits: number;
}

function* matchesAt(start: number, root: Trie, edges: Syllable[][]): Generator<WordMatch> {
  const stack = [{ node: root, position: start, tones: [] as string[], splits: 0 }];
  let budget = 800;
  while (stack.length && budget-- > 0) {
    const state = stack.pop()!;
    if (state.tones.length) {
      for (const entry of state.node.entries) {
        let missingTones = 0;
        let valid = true;
        for (let i = 0; i < state.tones.length; i++) {
          if (state.tones[i]) {
            if (state.tones[i] !== entry.tones[i]) {
              valid = false;
              break;
            }
          } else if (entry.tones[i] !== "0") missingTones++;
        }
        if (valid) yield {
          entry, end: state.position, length: state.tones.length,
          missingTones, splits: state.splits,
        };
      }
    }
    if (state.tones.length >= MAX_WORD_SYLLABLES) continue;
    for (const edge of edges[state.position] ?? []) {
      const node = state.node.children.get(edge.base);
      if (node) stack.push({
        node, position: edge.end, tones: [...state.tones, edge.tone],
        splits: state.splits + Number(edge.impliedSplit),
      });
    }
  }
}

function compare(a: ZhuyinCandidate, b: ZhuyinCandidate): number {
  return b.score - a.score || a.impliedSplits - b.impliedSplits
    || a.missingTones - b.missingTones || b.wordSyllables - a.wordSyllables;
}

function insert(beam: ZhuyinCandidate[], candidate: ZhuyinCandidate): void {
  const last = beam.at(-1);
  if (beam.length === BEAM_WIDTH && last && compare(candidate, last) >= 0) return;
  const duplicate = beam.findIndex((item) => item.text === candidate.text);
  if (duplicate !== -1) {
    const previous = beam[duplicate];
    if (previous && compare(candidate, previous) >= 0) return;
    beam.splice(duplicate, 1);
  }
  const next = beam.findIndex((item) => compare(candidate, item) < 0);
  beam.splice(next < 0 ? beam.length : next, 0, candidate);
  if (beam.length > BEAM_WIDTH) beam.pop();
}

export function decodeZhuyin(keys: string): ZhuyinCandidate[] {
  const input = normalizeKeys(keys).toLowerCase().trim().replace(/[ \t]+/g, " ");
  if (!input || input.replaceAll(" ", "").length > MAX_KEYS
    || !/^[a-z0-9,;./ -]+$/.test(input) || /[\r\n]/.test(keys)) return [];
  const cached = cache.get(input);
  if (cached) {
    cache.delete(input);
    cache.set(input, cached);
    return cached;
  }
  const { root, syllables } = lexicon ??= buildLexicon();
  const edges = Array.from(input, (_, start) => syllablesAt(input, start, syllables));
  const states: ZhuyinCandidate[][] = [];
  states[0] = [{
    text: "", score: 0, syllables: 0, wordSyllables: 0,
    trailingWordSyllables: 0, strongestWord: 0, missingTones: 0, impliedSplits: 0,
  }];
  for (let start = 0; start < input.length; start++) {
    const prefixes = states[start];
    if (!prefixes?.length) continue;
    for (const match of matchesAt(start, root, edges)) {
      const beam = states[match.end] ??= [];
      for (const prefix of prefixes) {
        insert(beam, {
          text: prefix.text + match.entry.text,
          score: prefix.score + match.entry.score - 1.3 * match.missingTones - 2.2 * match.splits,
          syllables: prefix.syllables + match.length,
          wordSyllables: prefix.wordSyllables + (match.length > 1 ? match.length : 0),
          trailingWordSyllables: match.length,
          strongestWord: Math.max(prefix.strongestWord, match.length > 1 ? match.entry.frequency : 0),
          missingTones: prefix.missingTones + match.missingTones,
          impliedSplits: prefix.impliedSplits + match.splits,
        });
      }
    }
  }
  const result = (states[input.length] ?? []).slice(0, 5);
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(input, result);
  return result;
}
