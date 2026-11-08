import type { Database } from '../src/platform/database/database.js';

export type ProblemFixture = {
  slug: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  languages: { language: 'javascript' | 'python'; starterCode: string; referenceSolution: string }[];
};

export async function truncateProblems(sql: Database): Promise<void> {
  await sql`TRUNCATE problems, problem_languages`;
}

export async function insertProblem(sql: Database, problem: ProblemFixture): Promise<void> {
  const [{ id }] = await sql<{ id: number }[]>`
    INSERT INTO problems (slug, title, difficulty, description)
    VALUES (${problem.slug}, ${problem.title}, ${problem.difficulty}, ${problem.description})
    RETURNING id
  `;

  // One row at a time, in the given order, so a test controls the order rows are stored in.
  for (const language of problem.languages) {
    await sql`
      INSERT INTO problem_languages (problem_id, language, starter_code, reference_solution)
      VALUES (${id}, ${language.language}, ${language.starterCode}, ${language.referenceSolution})
    `;
  }
}
