import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './platform/config/env.schema.js';
import { APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import {
  StandardSchemaValidationPipe,
  StandardSchemaSerializerInterceptor,
} from '@nestjs/common';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { ProblemsModule } from './modules/problems/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests get their settings from the test setup, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validationSchema: envSchema,
    }),
    DatabaseModule,
    HealthModule,
    ProblemsModule,
  ],
  controllers: [],

  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor },
  ],
})
export class AppModule {}
