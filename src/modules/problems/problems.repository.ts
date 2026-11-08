import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../platform/database/database.js';
import type { ProblemDetail } from './problems.dto.js';

@Injectable()
export class ProblemsRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  // Selects public columns only, so reference_solution never leaves the database on this path.
  async findPublicBySlug(slug: string): Promise<ProblemDetail | undefined> {
    const [problem] = await this.sql<
      {
        id: number;
        slug: string;
        title: string;
        difficulty: 'easy' | 'medium' | 'hard';
        description: string;
      }[]
    >`
      SELECT id, slug, title, difficulty, description
      FROM problems
      WHERE slug = ${slug}
    `;
    if (!problem) {
      return undefined;
    }

    const languages = await this.sql<
      { language: 'javascript' | 'python'; starterCode: string }[]
    >`
      SELECT language, starter_code AS "starterCode"
      FROM problem_languages
      WHERE problem_id = ${problem.id}
      ORDER BY language
    `;

    return {
      slug: problem.slug,
      title: problem.title,
      difficulty: problem.difficulty,
      description: problem.description,
      languages,
    };
  }
}
