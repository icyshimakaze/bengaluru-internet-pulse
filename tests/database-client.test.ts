import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseFetch, DATABASE_REQUEST_TIMEOUT_MS } from "@/lib/db/client";

afterEach(() => vi.restoreAllMocks());
describe("bounded server-side database transport", () => {
  it("preserves SDK authorization and cancellation while preventing Next.js fetch caching", async () => {
    const parent = new AbortController(), request = new Request("https://database.example/v2/pipeline", {
      method: "POST", headers: { Authorization: "Bearer PRIVATE_DB_TOKEN" }, body: "{}", signal: parent.signal });
    const deadline = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await databaseFetch(request);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![0]).toBe(request);
    const init = fetcher.mock.calls[0]![1]!;
    expect(init.cache).toBe("no-store"); expect(init.signal?.aborted).toBe(false);
    expect(deadline).toHaveBeenCalledWith(DATABASE_REQUEST_TIMEOUT_MS);
    parent.abort(); expect(init.signal?.aborted).toBe(true);
  });
  it("aborts a stalled remote request at the database deadline without calling a real endpoint", async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("DATABASE_TIMEOUT")), { once: true });
    }));
    const result = databaseFetch("https://database.example/v2/pipeline");
    timeout.abort(); await expect(result).rejects.toThrow("DATABASE_TIMEOUT");
  });
});
