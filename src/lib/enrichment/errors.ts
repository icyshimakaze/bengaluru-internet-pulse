import "server-only";
import { ZodError } from "zod";
import { EnrichmentConfigurationError } from "./types";

export function enrichmentHttpStatus(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number"
    && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined;
}

// Only exact internal codes enter logs, never upstream messages or bodies.
const outputCodes = new Set([
  "ENRICHMENT_OUTPUT_UNAVAILABLE", "ENRICHMENT_OUTPUT_TRUNCATED", "ENRICHMENT_OUTPUT_REFUSED", "ENRICHMENT_OUTPUT_TOOLS",
  "ENRICHMENT_BATCH_IDS", "ENRICHMENT_TOPIC_COLLISION", "ENRICHMENT_SIGNAL_ID", "ENRICHMENT_TOPIC_CHOICE",
  "ENRICHMENT_TOPIC_ID", "ENRICHMENT_TOPIC_METADATA", "ENRICHMENT_LABEL_UNSUPPORTED", "ENRICHMENT_LOCATION_UNSUPPORTED",
  "ENRICHMENT_SUMMARY_LENGTH", "ENRICHMENT_SUMMARY_UNSUPPORTED",
]);
export function enrichmentFailureCode(error: unknown): string {
  if (error instanceof EnrichmentConfigurationError) return error.code;
  const http = enrichmentHttpStatus(error);
  if (http === 400 || http === 422) return "ENRICHMENT_REQUEST_REJECTED";
  if (http === 401) return "ENRICHMENT_AUTHENTICATION_FAILED";
  if (http === 403) return "ENRICHMENT_ACCESS_DENIED";
  if (http === 404) return "ENRICHMENT_MODEL_UNAVAILABLE";
  if (http === 429) return "ENRICHMENT_RATE_LIMITED";
  if (http && http >= 500) return "ENRICHMENT_UPSTREAM_FAILED";
  if (error instanceof ZodError) return "ENRICHMENT_SCHEMA_INVALID";
  if (error instanceof SyntaxError) return "ENRICHMENT_MALFORMED_JSON";
  if (error instanceof Error && ["TimeoutError", "AbortError", "APIConnectionTimeoutError"].includes(error.name)) return "ENRICHMENT_TIMEOUT";
  if (error instanceof Error && outputCodes.has(error.message)) return error.message;
  return "ENRICHMENT_INVALID_OR_UNAVAILABLE";
}
