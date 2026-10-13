import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Signal } from "@/lib/domain/schema";
import { enrichmentBatchSchema, type EnrichmentTopic } from "@/lib/domain/enrichment";
import { withAbort } from "@/lib/sources/http";
import type { EnrichmentProvider } from "./types";
import { ENRICHMENT_INSTRUCTIONS, enrichmentInput } from "./prompt";
import { validateBatch } from "./validation";

export class OpenAIEnrichmentProvider implements EnrichmentProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI;
  constructor(apiKey: string, readonly model: string) {
    // Do not let an ambient OPENAI_BASE_URL redirect the official provider to xKiro.
    this.client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", timeout: 8000, maxRetries: 0 });
  }
  async enrich(signals: Signal[], catalog: EnrichmentTopic[], { signal }: { signal: AbortSignal }) {
    const response = await withAbort(this.client.responses.parse({ model: this.model, store: false, max_output_tokens: 4000,
      instructions: ENRICHMENT_INSTRUCTIONS, tools: [], tool_choice: "none",
      input: [{ role: "user", content: [{ type: "input_text", text: enrichmentInput(signals, catalog) }] }],
      text: { format: zodTextFormat(enrichmentBatchSchema, "bengaluru_enrichment") },
    }, { signal }), signal);
    if (response.status !== "completed" || !response.output_parsed) throw new Error("ENRICHMENT_OUTPUT_UNAVAILABLE");
    return validateBatch(response.output_parsed, signals, catalog);
  }
}
