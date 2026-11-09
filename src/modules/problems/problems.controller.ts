import { Controller, Get, Param, SerializeOptions } from '@nestjs/common';
import {
  type ProblemResponse,
  problemResponseSchema,
  problemsSlugSchema,
} from './problems.dto.js';
import { ProblemsService } from './problems.service.js';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('problems')
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get(':slug')
  @SerializeOptions({ schema: problemResponseSchema })
  @ApiOkResponse({
    description: 'The problem and its starter code for each offered language.',
    standardSchema: problemResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'The slug is malformed.' })
  @ApiNotFoundResponse({ description: 'No problem has this slug.' })
  async getBySlug(
    @Param('slug', { schema: problemsSlugSchema }) slug: string,
  ): Promise<ProblemResponse> {
    return { data: await this.problemsService.getBySlug(slug) };
  }
}
