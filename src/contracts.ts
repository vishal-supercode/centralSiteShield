import { z } from "zod";

export const securityEventSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().min(1).max(128),
    timestamp: z.string().datetime(),
    request: z
      .object({
        siteId: z.string().min(1).max(128),
        ip: z.string().min(1).max(96),
        method: z.string().min(1).max(16),
        path: z.string().min(1).max(2048),
        userAgent: z.string().max(1024).optional(),
      })
      .strict(),
    decision: z.enum(["allow", "monitor", "limit", "block"]),
    score: z.number().int().min(0).max(1000),
    reasons: z.array(z.string().max(256)).max(32),
    counters: z
      .object({
        requests: z.number().int().min(0),
        loginAttempts: z.number().int().min(0),
      })
      .strict(),
  })
  .strict()
  .refine((event) => event.siteId === event.request.siteId, {
    message: "event site IDs must match",
  });

export const batchSchema = z
  .object({ events: z.array(securityEventSchema).min(1).max(100) })
  .strict();
export const newSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    origin: z.string().url().max(512),
  })
  .strict();
export type SecurityEvent = z.infer<typeof securityEventSchema>;
