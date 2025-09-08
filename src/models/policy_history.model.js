// This is a placeholder for Firestore "schema-like" helpers.
// Consider using Zod to validate shape before writing to Firestore.

import { z } from 'zod';

export const PolicyHistoryCreateSchema = z.object({
  policyRef: docRefTo("policies"),
  version: z.number().min(1)
});

export const PolicyHistoryUpdateSchema = PolicyHistoryCreateSchema.partial();
