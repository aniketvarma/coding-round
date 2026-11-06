import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  // This does the exact same thing, just with more typing!
  async check(): Promise<HealthCheckResult> {
    const report = await this.health.check([
      () => this.database.isHealthy('database'),
    ]);
    return report;
  }
}
