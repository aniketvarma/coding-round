import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DATABASE, type Database } from '../src/platform/database/database.js';
import { createTestApp } from './app.js';
import { insertProblem, type ProblemFixture, truncateProblems } from './fixtures.js';

// Python is stored first, so JavaScript can only come first in the response because of the query's ORDER BY.
const twoSum: ProblemFixture = {
  slug: 'two-sum',
  title: 'Two Sum',
  difficulty: 'easy',
  description: 'Find two numbers that add up to the target.',
  languages: [
    { language: 'python', starterCode: 'def two_sum(): pass', referenceSolution: 'SECRET-PY' },
    { language: 'javascript', starterCode: 'function twoSum() {}', referenceSolution: 'SECRET-JS' },
  ],
};

// A second problem, so a query that ignores the slug or problem_id returns rows that don't belong.
const validParentheses: ProblemFixture = {
  slug: 'valid-parentheses',
  title: 'Valid Parentheses',
  difficulty: 'medium',
  description: 'Check that every bracket is closed.',
  languages: [{ language: 'python', starterCode: 'def is_valid(): pass', referenceSolution: 'SECRET-VP' }],
};

describe('GET /problems/:slug', () => {
  let app: INestApplication;
  let sql: Database;

  beforeAll(async () => {
    app = await createTestApp();
    sql = app.get(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateProblems(sql);
  });

  it('returns the problem with only its own languages, JavaScript first', async () => {
    await insertProblem(sql, twoSum);
    await insertProblem(sql, validParentheses);

    const response = await request(app.getHttpServer()).get('/problems/two-sum');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        description: 'Find two numbers that add up to the target.',
        languages: [
          { language: 'javascript', starterCode: 'function twoSum() {}' },
          { language: 'python', starterCode: 'def two_sum(): pass' },
        ],
      },
    });
    expect(response.text).not.toContain('SECRET');
  });

  it('returns 404 for a slug that is not in the database', async () => {
    await insertProblem(sql, validParentheses);

    const response = await request(app.getHttpServer()).get('/problems/two-sum');

    expect(response.status).toBe(404);
  });

  it('returns 400 for a malformed slug', async () => {
    const response = await request(app.getHttpServer()).get('/problems/Two-Sum');

    expect(response.status).toBe(400);
  });
});
