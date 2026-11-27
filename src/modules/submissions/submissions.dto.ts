import { z } from 'zod';
import { languageSchema, problemsSlugSchema } from '../problems/index.js';

// Must list the same values as the submission_status enum in the create_submissions migration.
const submissionStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
]);

export const createSubmissionRequestSchema = z.object({
  problemSlug: problemsSlugSchema,
  language: languageSchema,
  code: z
    .string()
    .min(1, 'Code cannot be empty.')
    .max(50_000, 'Must be at most 50,000 characters.'),
});

export const createSubmissionResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    status: submissionStatusSchema,
  }),
});

export type CreateSubmissionRequest = z.infer<
  typeof createSubmissionRequestSchema
>;
export type CreateSubmissionResponse = z.infer<
  typeof createSubmissionResponseSchema
>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
