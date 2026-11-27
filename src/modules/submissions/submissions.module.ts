import { Module } from '@nestjs/common';
import { ProblemsModule } from '../problems/index.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsRepository } from './submissions.repository.js';
import { SubmissionsService } from './submissions.service.js';

@Module({
  imports: [ProblemsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsRepository],
})
export class SubmissionsModule {}
