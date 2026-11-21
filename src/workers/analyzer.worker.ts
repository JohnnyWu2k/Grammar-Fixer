import { analyze } from "../core/analyze";
import type { AnalysisRequest, AnalysisResponse } from "../core/types";

// No DOM, storage, telemetry, or remote inference in the analysis worker.
const context = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (response: AnalysisResponse) => void;
};

context.onmessage = ({ data }) => {
  try {
    context.postMessage({ id: data.id, result: analyze(data.text, data.options) });
  } catch {
    context.postMessage({ id: data.id, error: "無法分析這段文字，請縮短內容後重試。" });
  }
};
