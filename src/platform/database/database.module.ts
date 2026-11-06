import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import type { Env } from '../config/env.schema.js';
import { DATABASE, type Database } from './database.js';

// Global, so repositories in any module can inject DATABASE without importing this module.
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Database =>
        postgres(config.get('DATABASE_URL', { infer: true })),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  // Lets in-flight queries finish (up to 5 seconds), then closes the connections so the process can exit.
  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
