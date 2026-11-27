import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.DATABASE_URL || import.meta.env?.DATABASE_URL || 'postgres://lumiere:lumiere@localhost:5432/lumiere';

// Reuse one pool across dev hot-reloads.
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
export const sql = g.__pg ?? postgres(url, { max: Number(process.env.DB_POOL || 10), idle_timeout: 30 });
if (!g.__pg) g.__pg = sql;

export const db = drizzle(sql, { schema });
export { schema };
