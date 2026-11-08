import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProblemDetail } from './problems.dto.js';
import { ProblemsRepository } from './problems.repository.js';

@Injectable()
export class ProblemsService {
  constructor(private readonly problemsRepository: ProblemsRepository) {}

  async getBySlug(slug: string): Promise<ProblemDetail> {
    const problem = await this.problemsRepository.findPublicBySlug(slug);

    if (!problem) {
      throw new NotFoundException(`Problem '${slug}' was not found`);
    }

    return problem;
  }
}
