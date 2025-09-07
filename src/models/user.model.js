import { z } from 'zod';
 
export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['patient', 'hospital']).default('patient'),
  password: z.string().min(6),
  insuredAt: z.string().min(1).nullish(),
  ilnesses: z
    .array(
      z.object({
        name: z.string().min(1), // illness name
        medications: z.array(z.string().min(1)).default([]), // array of medications
      })
    )
    .default([]), // default empty medicalRecords
});
 
export const UserUpdateSchema = UserCreateSchema.partial();