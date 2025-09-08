import { z } from "zod";

const base = {
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['patient', 'hospital']),
  password: z.string().min(6),
};

// Patient schema
const PatientSchema = z.object({
  ...base,
  role: z.literal('patient'),
  insuredAt: z.array(z.string()).default([]),
  illnesses: z.array(
    z.object({
      name: z.string().min(1),
      medications: z.array(z.string().min(1)).default([]),
    })
  ).default([]),
  patients: z.null().default(null), // hospital-only field is null here
});

// Hospital schema
const HospitalSchema = z.object({
  ...base,
  role: z.literal('hospital'),
  insuredAt: z.undefined().optional(),
  ilnesses: z.undefined().optional(),
  patients: z.array(z.string()).default([]), // list of patient IDs
});

export const UserCreateSchema = z.discriminatedUnion("role", [
  PatientSchema,
  HospitalSchema,
]);
