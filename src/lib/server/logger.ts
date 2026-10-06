import "server-only";

type Fields = Record<string, string | number | boolean | null>;
export function log(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
export function errorCode(error: unknown): string {
  if (error instanceof Error && /^HTTP_\d{3}$/.test(error.message)) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "TIMEOUT";
  if (error instanceof Error && error.name === "ZodError") return "INVALID_PAYLOAD";
  if (error instanceof SyntaxError) return "INVALID_JSON";
  if (error instanceof Error && ["RESPONSE_TOO_LARGE", "EMPTY_BODY"].includes(error.message)) return error.message;
  if (error instanceof TypeError) return "NETWORK_ERROR";
  return "SOURCE_UNAVAILABLE";
}
