import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './app.js';
import postgres from 'postgres';
import { DATABASE } from '../src/platform/database/database.js';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 while the database is up', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' } },
    });
  });
});

describe('GET /health while the database is unreachable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      // Nothing listens on port 1, so every query fails to connect.
      builder
        .overrideProvider(DATABASE)
        .useValue(
          postgres('postgres://postgres:postgres@127.0.0.1:1/unreachable'),
        ),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 with the Terminus body and no connection details', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      info: {},
      error: { database: { status: 'down', message: 'database unreachable' } },
      details: {
        database: { status: 'down', message: 'database unreachable' },
      },
    });
  });
});
