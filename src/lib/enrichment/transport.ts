import "server-only";

// A configured provider must not redirect an authenticated request to another
// host (including a private endpoint). Preserve the SDK's abort signal.
export const enrichmentFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, redirect: "error", cache: "no-store", credentials: "omit" });
