import { z } from 'zod';

export const problemsSlugSchema = z
  .string()
  .max(100, 'Must be at most 100 characters.')
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Use lowercase letters, digits, and single hyphens.',
  );

// Must list the same values as the difficulty and language enums in the create_problems migration.
const difficultySchema = z.enum(['easy', 'medium', 'hard']);
const languageSchema = z.enum(['javascript', 'python']);

export const problemDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: difficultySchema,
  description: z.string(),
  languages: z.array(
    z.object({
      language: languageSchema,
      starterCode: z.string(),
    }),
  ),
});

// Success bodies are { data, meta? }; this endpoint has nothing for meta.
export const problemResponseSchema = z.object({ data: problemDetailSchema });

export type Difficulty = z.infer<typeof difficultySchema>;
export type Language = z.infer<typeof languageSchema>;
export type ProblemDetail = z.infer<typeof problemDetailSchema>;
export type ProblemResponse = z.infer<typeof problemResponseSchema>;
