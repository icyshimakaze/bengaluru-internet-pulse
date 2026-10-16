import { z } from "zod";

// Shared by ingestion, persisted records and public DTOs. These links are never
// fetched as article bodies. Reject credentials, local names and IP literals,
// including WHATWG-normalized decimal/hex IPv4 and IPv6 loopback forms.
export const httpUrlSchema = z.string().max(2048).refine((value) => {
  if (!/^https?:\/\//u.test(value) || /[\s\x00-\x1f\x7f\\]/u.test(value)) return false;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/u, "");
    return !url.username && !url.password && host.length <= 253 && host.includes(".") &&
      !host.includes(":") && !/^[\d.]+$/u.test(host) &&
      !/(^|\.)(localhost|local|internal|lan|home|test)$/u.test(host) &&
      /^[a-z\d.-]+$/u.test(host);
  } catch { return false; }
}, "A public HTTP(S) hostname without credentials is required");
