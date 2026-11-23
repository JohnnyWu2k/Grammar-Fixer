import type {
  AnalysisOptions, AnalysisRequest, AnalysisResponse, AnalysisResult,
} from "../core/types";

interface Pending {
  resolve: (result: AnalysisResult) => void;
  reject: () => void;
}

export class AnalyzerClient {
  private worker?: Worker;
  private unavailable = false;
  private sequence = 0;
  private pending = new Map<number, Pending>();

  async analyze(text: string, options: AnalysisOptions): Promise<AnalysisResult> {
    if (this.unavailable || typeof Worker === "undefined") return this.fallback(text, options);
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL("../workers/analyzer.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = ({ data }: MessageEvent<AnalysisResponse>) => {
          const request = this.pending.get(data.id);
          if (!request) return;
          this.pending.delete(data.id);
          if ("result" in data) request.resolve(data.result);
          else request.reject();
        };
        this.worker.onerror = () => {
          this.unavailable = true;
          this.worker?.terminate();
          for (const request of this.pending.values()) request.reject();
          this.pending.clear();
        };
      }
      const id = ++this.sequence;
      return await new Promise<AnalysisResult>((resolve, reject) => {
        this.pending.set(id, { resolve, reject: () => reject(new Error("Worker unavailable")) });
        const request: AnalysisRequest = { id, text, options };
        this.worker?.postMessage(request);
      });
    } catch {
      this.unavailable = true;
      this.worker?.terminate();
      this.worker = undefined;
      for (const request of this.pending.values()) request.reject();
      this.pending.clear();
      return this.fallback(text, options);
    }
  }

  private async fallback(text: string, options: AnalysisOptions): Promise<AnalysisResult> {
    const { analyzeInBrowser } = await import("../core/analyze-in-browser");
    return analyzeInBrowser(text, options);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) request.reject();
    this.pending.clear();
  }
}
