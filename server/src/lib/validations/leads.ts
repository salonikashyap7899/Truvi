import { z } from "zod";

export const createLeadSchema = z.object({
  projectId: z.string().min(1),
  clientName: z.string().min(2),
  clientPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  clientEmail: z.string().email().optional().or(z.literal("")),
  source: z.string().min(1),
  notes: z.string().optional(),
  confirmDuplicate: z.boolean().optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadStageSchema = z.object({
  stage: z.enum(["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST"]),
});

export const createSiteVisitSchema = z.object({
  leadId: z.string().min(1).optional(),
  projectId: z.string().min(1),
  scheduledAt: z.string().min(1),
  notes: z.string().optional(),
});

export const confirmAttendanceSchema = z.object({ lat: z.number(), lng: z.number() });

export const siteVisitReportSchema = z.object({
  reportNotes: z.string().min(1),
  nextSteps: z.string().optional(),
  newLeadStage: z.enum(["NEGOTIATION", "BOOKING", "REGISTRATION", "LOST", "CONTACTED"]).optional(),
});
