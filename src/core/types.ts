export const MAX_TEXT_LENGTH = 10_000;
// Applied spacing and replacements can grow a draft beyond its input length.
export const MAX_RESULT_LENGTH = 20_000;
export const MAX_SUGGESTIONS = 80;

export type Mode = "auto" | "english" | "zhuyin";
export type Category = "spelling" | "grammar" | "chinese" | "zhuyin" | "spacing";

export interface AnalysisOptions {
  mode: Mode;
  spacing: boolean;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface Suggestion extends TextRange {
  id: string;
  original: string;
  replacements: string[];
  category: Category;
  confidence: "high" | "medium";
  message: string;
}

export interface AnalysisResult {
  suggestions: Suggestion[];
  limited: boolean;
}

export interface Edit extends TextRange {
  original: string;
  replacement: string;
}

export interface AnalysisRequest {
  id: number;
  text: string;
  options: AnalysisOptions;
}

export type AnalysisResponse =
  | { id: number; result: AnalysisResult }
  | { id: number; error: string };
