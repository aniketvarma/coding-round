import { inject } from 'vitest';

// Runs before each test file's imports, because AppModule reads process.env the moment it's imported.
process.env.DATABASE_URL = inject('databaseUrl');
