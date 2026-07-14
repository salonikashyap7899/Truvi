import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  city: z.string().min(2),
  location: z.string().min(2),
  reraNumber: z.string().optional(),
  possessionDate: z.string().optional(),
  salesContact: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  commissionPercent: z.number().min(0).max(20).default(3),
  brochureUrl: z.string().url().optional().or(z.literal("")),
  priceListUrl: z.string().url().optional().or(z.literal("")),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const createUnitSchema = z.object({
  projectId: z.string().min(1),
  unitNumber: z.string().min(1),
  type: z.string().min(1),
  areaSqft: z.number().positive(),
  price: z.number().positive(),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updatePriceSchema = z.object({ price: z.number().positive() });
