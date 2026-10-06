import "server-only";

type Options = { timeoutMs?: number; attempts?: number; fetcher?: typeof fetch; init?: RequestInit };
export async function fetchJson(url: string, options: Options = {}): Promise<unknown> {
  const { timeoutMs = 8000, attempts = 2, fetcher = fetch, init = {} } = options;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json", ...init.headers } });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP_${response.status}`); }
      const limit = 2 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new Error("RESPONSE_TOO_LARGE"); }
      if (!response.body) throw new Error("EMPTY_BODY");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0, body = "";
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > limit) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); }
          body += decoder.decode(part.value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
      return JSON.parse(body) as unknown;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const transient = error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) || /^HTTP_(408|429|5\d\d)$/.test(code);
      if (!transient || attempt + 1 >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw new Error("RETRIES_EXHAUSTED");
}
