import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
} from '@nestjs/common';

import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import {
  type CreateSubmissionRequest,
  type CreateSubmissionResponse,
  createSubmissionRequestSchema,
  createSubmissionResponseSchema,
} from './submissions.dto.js';

import { SubmissionsService } from './submissions.service.js';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  // The verdict isn't ready yet; 202 says "accepted, check back".
  @HttpCode(HttpStatus.ACCEPTED)
  @SerializeOptions({ schema: createSubmissionResponseSchema })
  @ApiAcceptedResponse({
    description: 'The submission is queued for judging.',
    standardSchema: createSubmissionResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'The body is malformed.' })
  @ApiUnprocessableEntityResponse({
    description:
      'No problem has this slug, or it is not offered in this language.',
  })
  async create(
    @Body({ schema: createSubmissionRequestSchema })
    body: CreateSubmissionRequest,
  ): Promise<CreateSubmissionResponse> {
    return { data: await this.submissionsService.create(body) };
  }
}
