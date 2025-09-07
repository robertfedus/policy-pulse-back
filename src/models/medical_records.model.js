// This is a placeholder for Firestore "schema-like" helpers.
// Consider using Zod to validate shape before writing to Firestore.

import { z } from 'zod';

export const PoliciesCreateSchema = z.object({
  name: z.string().min(1, "name is required"),
  summary: z.string().min(1, "summary is required"),
  insuranceCompanyRef: docRefTo("insurance_companies"),
  beFileName: z.string().min(1, "beFileName is required"),
  effectiveDate: isoDate.nullish(), 
});

export const PoliciesUpdateSchema = PoliciesCreateSchema.partial();
