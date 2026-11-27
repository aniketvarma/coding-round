import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../platform/database/database.js';
import type { Language } from '../problems/index.js';
import type { SubmissionStatus } from './submissions.dto.js';

@Injectable()
export class SubmissionsRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async create(submission: {
    problemId: number;
    language: Language;
    code: string;
  }): Promise<{ id: string; status: SubmissionStatus }> {
    const [created] = await this.sql<
      { id: string; status: SubmissionStatus }[]
    >`
        INSERT INTO submissions (problem_id, language, code)
        VALUES (${submission.problemId}, ${submission.language}::language, ${submission.code})
        RETURNING id, status
   `;
    return created;
  }
}
