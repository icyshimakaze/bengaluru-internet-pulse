import { describe, expect, it } from "vitest";
import { z } from "zod";
import { enrichmentFailureCode, enrichmentHttpStatus } from "@/lib/enrichment/errors";

describe("private enrichment diagnostics", () => {
  it.each(["ENRICHMENT_SUMMARY_UNSUPPORTED", "ENRICHMENT_LABEL_UNSUPPORTED", "ENRICHMENT_OUTPUT_TRUNCATED"])("reports the exact internal rejection %s", (code) => {
    expect(enrichmentFailureCode(new Error(code))).toBe(code);
  });
  it("never emits arbitrary error messages or schema data", () => {
    expect(enrichmentFailureCode(new Error("PRIVATE_KEY and response body"))).toBe("ENRICHMENT_INVALID_OR_UNAVAILABLE");
    const result = z.object({ secret: z.literal("expected") }).safeParse({ secret: "PRIVATE_KEY" });
    expect(enrichmentFailureCode(result.error)).toBe("ENRICHMENT_SCHEMA_INVALID");
    expect(enrichmentFailureCode(new Error("ENRICHMENT_SUMMARY_UNSUPPORTED PRIVATE_KEY"))).toBe("ENRICHMENT_INVALID_OR_UNAVAILABLE");
  });
  it.each([[400, "ENRICHMENT_REQUEST_REJECTED"], [404, "ENRICHMENT_MODEL_UNAVAILABLE"], [422, "ENRICHMENT_REQUEST_REJECTED"]])("reports HTTP %s without echoing its body", (status, code) => {
    expect(enrichmentFailureCode({ status, message: "PRIVATE_KEY" })).toBe(code);
  });
  it.each([NaN, Infinity, 400.5, 200, 600, "401"])("rejects an invalid upstream status %s", (status) => {
    expect(enrichmentHttpStatus({ status })).toBeUndefined();
  });
});
