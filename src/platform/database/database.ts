import type postgres from 'postgres';

export const DATABASE = Symbol('DATABASE');
export type Database = postgres.Sql;
