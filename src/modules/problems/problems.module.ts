import { Module } from '@nestjs/common';
import { ProblemsController } from './problems.controller.js';
import { ProblemsRepository } from './problems.repository.js';
import { ProblemsService } from './problems.service.js';

@Module({
  controllers: [ProblemsController],
  providers: [ProblemsService, ProblemsRepository],
  exports: [ProblemsService],
})
export class ProblemsModule {}
