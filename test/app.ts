import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

// Lets a test swap one provider, such as the database, while keeping the rest of the production wiring.
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
): Promise<INestApplication> {
  const moduleRef = await customize(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
