import type { RequestHandler } from './$types';
import { honoApp } from '$lib/server/hono';

const handler: RequestHandler = async ({ request, platform }) => {
  const url = new URL(request.url);
  const honoRequest = new Request(url.toString(), request);
  const env = (platform?.env ?? {}) as Parameters<typeof honoApp.fetch>[1];
  const executionCtx = platform?.context as Parameters<typeof honoApp.fetch>[2];
  const response = await honoApp.fetch(honoRequest, env, executionCtx);
  return response as unknown as Response;
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
