import type { APIContext } from 'astro';
import { z } from 'zod';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const fail = (error: string, status = 400) => json({ error }, status);

export async function body<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const r = schema.safeParse(await req.json());
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Client IP as forwarded by Nginx (which overwrites X-Real-IP, so it can't be spoofed through it). */
export const clientIp = (ctx: APIContext) => ctx.request.headers.get('x-real-ip') ?? ctx.clientAddress ?? 'unknown';
