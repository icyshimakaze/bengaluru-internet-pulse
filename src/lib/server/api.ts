import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { categorySchema, sourceSchema, trendLifecycleSchema } from "@/lib/domain/schema";

export const querySchema = z.object({
  q: z.string().max(100).optional(), category: categorySchema.optional(), source: sourceSchema.optional(),
  lifecycle: trendLifecycleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
