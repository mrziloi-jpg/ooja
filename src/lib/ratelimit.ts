import { sql } from '~/db';

/** Fixed-window limiter backed by Postgres. Returns true if the action is allowed. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const [row] = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + make_interval(secs => ${windowSec}) ELSE rate_limits.reset_at END
    RETURNING count`;
  return row.count <= limit;
}
