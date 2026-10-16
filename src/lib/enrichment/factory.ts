import "server-only";
import { httpUrlSchema } from "@/lib/domain/urls";
import { getIngestionEnv, type IngestionEnv } from "@/lib/server/ingestion-env";
import { enrichmentProviderSchema, modelIdSchema, vendorModelIdSchema, type EnrichmentProviderName } from "@/lib/domain/enrichment-providers";
import { OpenAIEnrichmentProvider } from "./openai";
import { XKiroEnrichmentProvider } from "./xkiro";
import { HeuristicEnrichmentProvider } from "./heuristic";
import { EnrichmentConfigurationError, type EnrichmentProvider } from "./types";

const xKiroBaseUrlSchema = httpUrlSchema.refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
});

export function getEnrichmentProvider(env: IngestionEnv = getIngestionEnv(), override?: EnrichmentProviderName): EnrichmentProvider {
  const selected = enrichmentProviderSchema.parse(override ?? env.ENRICHMENT_PROVIDER);
  if (selected === "heuristic") return new HeuristicEnrichmentProvider();
  if (selected === "openai") {
    if (!env.OPENAI_API_KEY?.trim()) throw new EnrichmentConfigurationError(selected, "OPENAI_API_KEY_MISSING");
    const model = modelIdSchema.safeParse(env.OPENAI_MODEL);
    if (!model.success) throw new EnrichmentConfigurationError(selected, "OPENAI_MODEL_INVALID");
    return new OpenAIEnrichmentProvider(env.OPENAI_API_KEY, model.data);
  }
  if (!env.XKIRO_API_KEY?.trim()) throw new EnrichmentConfigurationError(selected, "XKIRO_API_KEY_MISSING");
  if (!env.XKIRO_MODEL?.trim()) throw new EnrichmentConfigurationError(selected, "XKIRO_MODEL_MISSING");
  const model = vendorModelIdSchema.safeParse(env.XKIRO_MODEL);
  if (!model.success) throw new EnrichmentConfigurationError(selected, "XKIRO_MODEL_INVALID");
  const baseUrl = xKiroBaseUrlSchema.safeParse(env.XKIRO_BASE_URL);
  if (!baseUrl.success) throw new EnrichmentConfigurationError(selected, "XKIRO_BASE_URL_INVALID");
  return new XKiroEnrichmentProvider(env.XKIRO_API_KEY, baseUrl.data, model.data);
}
