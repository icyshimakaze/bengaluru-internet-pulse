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
  it("honors rate-limit retry delays and avoids retrying long Retry-After responses early", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } })).mockResolvedValueOnce(Response.json({ ok: true }));
    expect(await fetchJson("https://example.org", { fetcher })).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const blocked = vi.fn<typeof fetch>().mockResolvedValue(new Response("rate limited", { status: 429, headers: { "Retry-After": "60" } }));
    await expect(fetchJson("https://example.org", { fetcher: blocked })).rejects.toThrow("HTTP_429");
    expect(blocked).toHaveBeenCalledTimes(1);
  });
  it("bounds a slow response body and streamed responses without content-length", async () => {
    const slow = new ReadableStream<Uint8Array>({ start() {} });
    await expect(fetchJson("https://example.org", { timeoutMs: 25, attempts: 1, fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(slow)) })).rejects.toMatchObject({ name: "TimeoutError" });
    const large = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.close(); } });
    await expect(fetchJson("https://example.org", { fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(large)) })).rejects.toThrow("RESPONSE_TOO_LARGE");
  });
  it("bounds fetchers that ignore abort and does not retry an aborted source deadline", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    await expect(fetchJson("https://example.org", { fetcher, timeoutMs: 25, attempts: 1 })).rejects.toMatchObject({ name: "TimeoutError" });
    const signal = AbortSignal.timeout(25);
    await expect(fetchJson("https://example.org", { fetcher, timeoutMs: 1000, signal })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
