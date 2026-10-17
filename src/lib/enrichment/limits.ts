import "server-only";
import type { EnrichmentProviderName } from "@/lib/domain/enrichment-providers";

// Free gateway requests can outlast the direct OpenAI budget. Keep the entire
// stage below the ingestion lease and reserve time for atomic publication.
export function enrichmentDeadlines(provider: EnrichmentProviderName) {
  return provider === "xkiro"
    ? { requestMs: 30000, stageMs: 60000 }
    : { requestMs: 8000, stageMs: 15000 };
}
