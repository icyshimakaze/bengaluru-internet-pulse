import "server-only";
import OpenAI from "openai";
import type { Signal } from "@/lib/domain/schema";
import type { EnrichmentTopic } from "@/lib/domain/enrichment";
import { withAbort } from "@/lib/sources/http";
import type { EnrichmentProvider } from "./types";
import { CHAT_INSTRUCTIONS, enrichmentInput, suppliedCatalog, xkiroBatchSchema } from "./prompt";
import { validateBatch } from "./validation";
import { enrichmentFetch } from "./transport";
import { enrichmentDeadlines } from "./limits";
import { factualSummary } from "./summary";

export class XKiroEnrichmentProvider implements EnrichmentProvider {
  readonly name = "xkiro" as const;
  private readonly client: OpenAI;
  constructor(apiKey: string, baseURL: string, readonly model: string) {
    this.client = new OpenAI({ apiKey, baseURL, timeout: enrichmentDeadlines(this.name).requestMs, maxRetries: 0, fetch: enrichmentFetch });
  }
  async enrich(signals: Signal[], catalog: EnrichmentTopic[], { signal }: { signal: AbortSignal }) {
    catalog = suppliedCatalog(catalog);
    const response = await withAbort(this.client.chat.completions.create({ model: this.model,
      messages: [{ role: "system", content: CHAT_INSTRUCTIONS }, { role: "user", content: enrichmentInput(signals, catalog) }],
      response_format: { type: "json_object" }, max_tokens: 4000, stream: false, tools: [], tool_choice: "none",
    }, { signal }), signal);
    const choice = response.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("ENRICHMENT_OUTPUT_TRUNCATED");
    if (choice?.message.refusal || choice?.finish_reason === "content_filter") throw new Error("ENRICHMENT_OUTPUT_REFUSED");
    if (choice?.message.tool_calls?.length || choice?.finish_reason === "tool_calls") throw new Error("ENRICHMENT_OUTPUT_TOOLS");
    if (choice?.finish_reason !== "stop" || !choice.message.content) {
      throw new Error("ENRICHMENT_OUTPUT_UNAVAILABLE");
    }
    // Reject prose, markdown fences, partial output and malformed JSON; no paid repair call.
    const classified = xkiroBatchSchema.parse(JSON.parse(choice.message.content));
    const byId = new Map(signals.map((item) => [item.id, item]));
    const items = classified.items.map((item) => {
      const source = byId.get(item.signal_id);
      if (!source) throw new Error("ENRICHMENT_BATCH_IDS");
      return { ...item, summary: factualSummary(source) };
    });
    return validateBatch({ items }, signals, catalog);
  }
}
