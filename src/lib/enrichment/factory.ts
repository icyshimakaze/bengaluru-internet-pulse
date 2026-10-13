import "server-only";
import { getEnv, type ServerEnv } from "@/lib/server/env";
import { enrichmentProviderSchema, vendorModelIdSchema, type EnrichmentProviderName } from "@/lib/domain/enrichment-providers";
import { OpenAIEnrichmentProvider } from "./openai";
import { XKiroEnrichmentProvider } from "./xkiro";
import { HeuristicEnrichmentProvider } from "./heuristic";
import { EnrichmentConfigurationError, type EnrichmentProvider } from "./types";

export function getEnrichmentProvider(env: ServerEnv = getEnv(), override?: EnrichmentProviderName): EnrichmentProvider {
  const selected = enrichmentProviderSchema.parse(override ?? env.ENRICHMENT_PROVIDER);
  if (selected === "heuristic") return new HeuristicEnrichmentProvider();
  if (selected === "openai") {
    if (!env.OPENAI_API_KEY?.trim()) throw new EnrichmentConfigurationError(selected, "OPENAI_API_KEY_MISSING");
    return new OpenAIEnrichmentProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  }
  if (!env.XKIRO_API_KEY?.trim()) throw new EnrichmentConfigurationError(selected, "XKIRO_API_KEY_MISSING");
  if (!env.XKIRO_MODEL?.trim()) throw new EnrichmentConfigurationError(selected, "XKIRO_MODEL_MISSING");
  const model = vendorModelIdSchema.safeParse(env.XKIRO_MODEL);
  if (!model.success) throw new EnrichmentConfigurationError(selected, "XKIRO_MODEL_INVALID");
  return new XKiroEnrichmentProvider(env.XKIRO_API_KEY, env.XKIRO_BASE_URL, model.data);
}
