// This is a placeholder for Firestore "schema-like" helpers.
// Consider using Zod to validate shape before writing to Firestore.

import { z } from 'zod';

export const InsuranceCompanyCreateSchema = z.object({
  name: z.string().min(1)
});

export const InsuranceCompanyUpdateSchema = InsuranceCompanyCreateSchema.partial();
