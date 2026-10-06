import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/sources/http";
describe("bounded upstream transport", () => {
  it("retries transient failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(Response.json({ ok: true }));
    expect(await fetchJson("https://example.org", { fetcher })).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("never retries permanent client errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("no", { status: 401 }));
    await expect(fetchJson("https://example.org", { fetcher })).rejects.toThrow("HTTP_401");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized responses and malformed JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { headers: { "content-length": "3000000" } }));
    await expect(fetchJson("https://example.org", { fetcher })).rejects.toThrow("RESPONSE_TOO_LARGE");
    await expect(fetchJson("https://example.org", { fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json")) })).rejects.toThrow();
  });
  it("bounds exhausted retries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network"));
    await expect(fetchJson("https://example.org", { fetcher, attempts: 2 })).rejects.toThrow("network");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("aborts a stalled source within the deadline", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    await expect(fetchJson("https://example.org", { fetcher, timeoutMs: 25, attempts: 1 })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
