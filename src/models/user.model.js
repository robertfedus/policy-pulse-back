// This is a placeholder for Firestore "schema-like" helpers.
// Consider using Zod to validate shape before writing to Firestore.

import { z } from 'zod';

export const UserCreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  // add fields as needed
});

export const UserUpdateSchema = UserCreateSchema.partial();
