import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './platform/config/env.schema.js';
import { APP_PIPE } from '@nestjs/core';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { DatabaseModule } from './platform/database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests get their settings from the test setup, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validationSchema: envSchema,
    }),
    DatabaseModule,
  ],
  controllers: [],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
})
export class AppModule {}
