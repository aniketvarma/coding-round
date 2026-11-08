import { Controller, Get, Param, SerializeOptions } from '@nestjs/common';
import {
  type ProblemResponse,
  problemResponseSchema,
  problemsSlugSchema,
} from './problems.dto.js';
import { ProblemsService } from './problems.service.js';

@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get(':slug')
  @SerializeOptions({ schema: problemResponseSchema })
  async getBySlug(
    @Param('slug', { schema: problemsSlugSchema }) slug: string,
  ): Promise<ProblemResponse> {
    return { data: await this.problemsService.getBySlug(slug) };
  }
}
