import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Env } from './platform/config/env.schema.js';

// HTTP-level setup. main.ts and the e2e tests both call it, so tests run the production wiring.
export function configureApp(app: INestApplication): void {
  const config: ConfigService<Env, true> = app.get(ConfigService);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  
  app.use(
    helmet({
      // Safari applies upgrade-insecure-requests even to http://localhost, which breaks /docs in development.
      contentSecurityPolicy: isProduction
        ? undefined
        : { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

  if (!isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ai-mock-interview API')
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
