import "server-only";
import type { Signal } from "@/lib/domain/schema";
import type { EnrichmentResult, EnrichmentTopic } from "@/lib/domain/enrichment";
import type { EnrichmentProviderName } from "@/lib/domain/enrichment-providers";

export interface EnrichmentProvider {
  readonly name: EnrichmentProviderName;
  readonly model: string | null;
  enrich(signals: Signal[], activeTopics: EnrichmentTopic[], context: { signal: AbortSignal }): Promise<EnrichmentResult[]>;
}

export class EnrichmentConfigurationError extends Error {
  constructor(readonly provider: EnrichmentProviderName, readonly code: "OPENAI_API_KEY_MISSING" | "XKIRO_API_KEY_MISSING" | "XKIRO_MODEL_MISSING" | "XKIRO_MODEL_INVALID") {
    super(`Enrichment configuration error: ${code}. This provider is unavailable; use the heuristic fallback.`);
    this.name = "EnrichmentConfigurationError";
  }
}
