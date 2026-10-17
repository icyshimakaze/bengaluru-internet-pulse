import { z } from "zod";

export const enrichmentProviderSchema = z.enum(["openai", "xkiro", "heuristic"]);
export type EnrichmentProviderName = z.infer<typeof enrichmentProviderSchema>;
// Historic mocks remain identifiable; they are not relabeled as genuine heuristics.
export const storedEnrichmentProviderSchema = z.enum(["openai", "xkiro", "heuristic", "mock"]);
export const modelIdSchema = z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
export const vendorModelIdSchema = modelIdSchema.refine((v) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(v), "XKIRO_MODEL requires a vendor/model ID");
export function validProviderModel(provider: z.infer<typeof storedEnrichmentProviderSchema>, model: string | null): boolean {
  return provider === "heuristic" || provider === "mock" ? model === null
    : provider === "xkiro" ? vendorModelIdSchema.safeParse(model).success : modelIdSchema.safeParse(model).success;
}

// Up to 30 API candidates plus a bounded 500-item local recovery pass.
const count = z.number().int().min(0).max(530);
export const enrichmentRunSchema = z.object({
  selectedProvider: enrichmentProviderSchema, actualProviders: z.array(enrichmentProviderSchema).max(3),
  attempted: count, aiEnriched: count.max(30), heuristicEnriched: count, unprocessed: count,
  providerErrors: z.number().int().nonnegative(), fallbackCount: count,
}).strict().superRefine((v, ctx) => {
  if (v.aiEnriched + v.heuristicEnriched + v.unprocessed !== v.attempted ||
      new Set(v.actualProviders).size !== v.actualProviders.length || v.fallbackCount > v.attempted ||
      !!v.heuristicEnriched !== v.actualProviders.includes("heuristic") ||
      !!v.aiEnriched !== v.actualProviders.some((p) => p !== "heuristic") ||
      v.actualProviders.some((p) => p !== "heuristic" && p !== v.selectedProvider)) {
    ctx.addIssue({ code: "custom", message: "Inconsistent enrichment run counters or provider provenance" });
  }
});
export type EnrichmentRun = z.infer<typeof enrichmentRunSchema>;
export function emptyEnrichmentRun(selectedProvider: EnrichmentProviderName): EnrichmentRun {
  return { selectedProvider, actualProviders: [], attempted: 0, aiEnriched: 0, heuristicEnriched: 0,
    unprocessed: 0, providerErrors: 0, fallbackCount: 0 };
}
export function actualProvider(run: EnrichmentRun): EnrichmentProviderName | "mixed" | "none" {
  return run.actualProviders.length > 1 ? "mixed" : run.actualProviders[0] ?? "none";
}
