import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { topicListQuerySchema } from "@/lib/domain/read-models";

export const querySchema = topicListQuerySchema;
export function parseParameters<T extends z.ZodType>(request: Request | undefined, schema: T) {
  const parameters = new URL(request?.url ?? "http://localhost/").searchParams;
  for (const key of parameters.keys()) if (parameters.getAll(key).length !== 1) return { success: false as const };
  return schema.safeParse(Object.fromEntries(parameters));
}
export const emptyQuerySchema = z.object({}).strict();
export function invalidQuery() { return json({ error: "Invalid query parameters", code: "INVALID_QUERY" }, 400); }
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
