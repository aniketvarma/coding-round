import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {envSchema} from './platform/config/env.schema.js';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

