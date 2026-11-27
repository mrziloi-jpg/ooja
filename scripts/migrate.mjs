// Production migration runner (plain JS so it runs without tsx in the slim image).
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
await sql.end();
console.log('migrations applied');
