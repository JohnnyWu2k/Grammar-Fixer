import { toKeys } from "../core/zhuyin-keys";
import type { Mode } from "../core/types";

export type ExampleKind = "english" | "zhuyin" | "mixed";
export type ExampleChoice = ExampleKind | "random";

export interface Example {
  text: string;
  kind: ExampleKind;
  mode: Mode;
}

const english = ["report", "agenda", "schedule", "document", "outline", "proposal"].flatMap((topic) =>
  ["before lunch", "this afternoon", "tomorrow", "before the meeting"].flatMap((time) => [
    `i has teh ${topic} ready. Please review it ${time}.`,
    `We will definately send the the ${topic} ${time}.`,
    `They is waiting to recieve the ${topic}. Can you send it ${time}?`,
  ]));

// Each group has coherent greetings and follow-up phrases. A group never
// combines unrelated clauses just to manufacture more variants.
const scenes = [
  {
    openings: ["ㄋㄧˇ ㄏㄠˇ", "ㄉㄚˋ ㄐㄧㄚ ㄏㄠˇ", "ㄋㄧㄣˊ ㄏㄠˇ"],
    replies: ["ㄐㄧㄣ ㄊㄧㄢ ㄊㄧㄢ ㄑㄧˋ ㄏㄣˇ ㄏㄠˇ", "ㄒㄧㄥˋ ㄏㄨㄟˋ", "ㄏㄠˇ ㄐㄧㄡˇ ㄅㄨˊ ㄐㄧㄢˋ"],
  },
  {
    openings: ["ㄅㄠˋ ㄑㄧㄢˋ", "ㄉㄨㄟˋ ㄅㄨˋ ㄑㄧˇ", "ㄅㄨˋ ㄏㄠˇ ㄧˋ ㄙ˙"],
    replies: ["ㄨㄛˇ ㄔˊ ㄉㄠˋ ㄌㄜ˙", "ㄨㄛˇ ㄎㄨㄞˋ ㄉㄠˋ ㄌㄜ˙", "ㄉㄥˇ ㄨㄛˇ ㄧˊ ㄒㄧㄚˋ"],
  },
  {
    openings: ["ㄒㄧㄝˋ ㄒㄧㄝ˙ ㄋㄧˇ", "ㄊㄞˋ ㄏㄠˇ ㄌㄜ˙", "ㄕㄡ ㄉㄠˋ ㄌㄜ˙"],
    replies: ["ㄒㄧㄣ ㄎㄨˇ ㄋㄧˇ ㄌㄜ˙", "ㄇㄟˊ ㄨㄣˋ ㄊㄧˊ", "ㄓㄣ ㄉㄜ˙ ㄏㄣˇ ㄅㄤˋ"],
  },
];
const spaced = (text: string) => text.split(" ").map(toKeys).join(" ");
const zhuyin = scenes.flatMap(({ openings, replies }) => openings.flatMap((opening) =>
  replies.flatMap((reply) => [
    `${toKeys(opening)}，${toKeys(reply)}。`,
    `${spaced(opening)}，${spaced(reply)}。`,
  ])));

const mixedScenes = [
  ["1l4fu04", "我以經更新文件了。", ["i has teh new version ready.", "You will recieve the document shortly."]],
  ["su3cl3", "我以經開啟專案。", ["The featre is ready for testing.", "i has an idea for the next udpate."]],
  ["vu,4vu,7", "這個工具因該能派上用場。", ["We will definately try it.", "Please share teh link with the team."]],
  ["cp3cl3", "這是我整理的注音範例。", ["The grammer checker is ready.", "Please review teh example before class."]],
] as const;
const mixed = mixedScenes.flatMap(([keys, sentence, lines]) =>
  lines.flatMap((line) => [`${keys}，${sentence}\n${line}`, `${keys}！${sentence}\n${line}`]));

const pools: Record<ExampleKind, Example[]> = {
  english: english.map((text) => ({ text, kind: "english", mode: "english" })),
  zhuyin: zhuyin.map((text) => ({ text, kind: "zhuyin", mode: "zhuyin" })),
  mixed: mixed.map((text) => ({ text, kind: "mixed", mode: "auto" })),
};

export function createExampleGenerator(random = Math.random) {
  const bags = new Map<ExampleChoice, Example[]>();
  let last: string | undefined;
  return (choice: ExampleChoice): Example => {
    let bag = bags.get(choice);
    if (!bag?.length) {
      bag = choice === "random" ? Object.values(pools).flat() : [...pools[choice]];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      bags.set(choice, bag);
    }
    let index = bag.length - 1;
    if (bag[index]?.text === last) {
      const alternative = bag.findIndex((example) => example.text !== last);
      if (alternative !== -1) index = alternative;
      else {
        // The last item overlaps a different category's most recent draw.
        bags.delete(choice);
        const spare = (choice === "random" ? Object.values(pools).flat() : pools[choice])
          .filter((example) => example.text !== last);
        const example = spare[Math.floor(random() * spare.length)]!;
        last = example.text;
        return example;
      }
    }
    const example = bag.splice(index, 1)[0]!;
    last = example.text;
    return example;
  };
}
