import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ProblemsService } from '../problems/index.js';
import { SubmissionsRepository } from './submissions.repository.js';
import type {
  CreateSubmissionRequest,
  SubmissionStatus,
} from './submissions.dto.js';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly problemsService: ProblemsService,
    private readonly submissionsRepository: SubmissionsRepository,
  ) {}

  async create(
    request: CreateSubmissionRequest,
  ): Promise<{ id: string; status: SubmissionStatus }> {
    const problemId = await this.problemsService.findIdBySlugAndLanguage(
      request.problemSlug,
      request.language,
    );

    if (problemId === undefined) {
      throw new UnprocessableEntityException(
        `Problem '${request.problemSlug}' isn't offered in ${request.language}.`,
      );
    }

    return this.submissionsRepository.create({
      problemId,
      language: request.language,
      code: request.code,
    });
  }
}
