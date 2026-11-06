import { envSchema } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/mock_interview',
};

function failingPaths(input: Record<string, string>): string[] {
  const result = envSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('envSchema', () => {
  describe('rejects', () => {
    it('a missing DATABASE_URL', () => {
      expect(failingPaths({})).toContain('DATABASE_URL');
    });

    it('a DATABASE_URL that is not a Postgres URL', () => {
      expect(
        failingPaths({ DATABASE_URL: 'mysql://root@localhost:3306/app' }),
      ).toContain('DATABASE_URL');
    });

    it('a PORT outside 1-65535', () => {
      expect(failingPaths({ ...validEnv, PORT: '70000' })).toContain('PORT');
    });
  });

  describe('accepts', () => {
    it('a minimal environment and fills in the defaults', () => {
      expect(envSchema.parse(validEnv)).toEqual({
        NODE_ENV: 'development',
        PORT: 3000,
        DATABASE_URL: validEnv.DATABASE_URL,
        CORS_ORIGINS: ['http://localhost:5173'],
      });
    });

    it('a postgresql:// URL, a numeric PORT string and several CORS origins', () => {
      const env = envSchema.parse({
        DATABASE_URL: 'postgresql://app:secret@db:5432/app',
        PORT: '8080',
        CORS_ORIGINS: 'http://localhost:5173, https://app.example.com',
      });

      expect(env.PORT).toBe(8080);
      expect(env.CORS_ORIGINS).toEqual([
        'http://localhost:5173',
        'https://app.example.com',
      ]);
    });
  });
});
