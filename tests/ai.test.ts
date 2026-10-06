import { afterEach, describe, expect, it, vi } from "vitest";
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { parse }; } }));
import { classifyAI } from "@/lib/pipeline/ai";
import { observation, topic } from "./helpers";
afterEach(() => { vi.unstubAllEnvs(); parse.mockReset(); });
describe("bounded AI canonicalization", () => {
  it("is disabled without credentials and never makes a request", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    expect((await classifyAI([observation("a", 1)], [topic])).size).toBe(0);
    expect(parse).not.toHaveBeenCalled();
  });
  it("validates catalog identities, ignores scoring fields and rejects invented locations", async () => {
    vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "test-key");
    const a = observation("a", 1), b = observation("b", 1);
    parse.mockResolvedValue({ output_parsed: { items: [
      { id: a.id, relevant: true, existingSlug: topic.slug, slug: topic.slug, title: "New title", category: "Technology", neighborhood: "Hebbal", description: "Discussion", score: 999 },
      { id: b.id, relevant: true, existingSlug: "invented-catalog-entry", slug: "invented", title: "Invented", category: "Technology", neighborhood: null, description: "Discussion" },
      { id: "unknown-id", relevant: false },
    ] } });
    const result = await classifyAI([a, b], [topic]);
    expect(result.get(a.id)).toEqual({ topic, neighborhood: null });
    expect(result.has(b.id)).toBe(false); expect(result.has("unknown-id")).toBe(false);
    expect(parse.mock.calls[0]?.[0].store).toBe(false);
    expect(JSON.parse(parse.mock.calls[0]?.[0].input).signals).toHaveLength(2);
  });
  it("falls back cleanly on API failure", async () => {
    vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "test-key"); parse.mockRejectedValue(new Error("unavailable"));
    expect((await classifyAI([observation("a", 1)], [topic])).size).toBe(0);
  });
});
