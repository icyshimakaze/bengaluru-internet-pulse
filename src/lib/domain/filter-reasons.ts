import { z } from "zod";
export const filterReasonSchema = z.enum(["job_posting", "weather_bot", "hashtag_spam", "near_empty"]);
export type FilterReason = z.infer<typeof filterReasonSchema>;
