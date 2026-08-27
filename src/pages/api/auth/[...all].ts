import type { APIRoute } from 'astro';
import { configuredAuth } from '@/lib/server/runtime';

export const ALL: APIRoute = async ({ request }) => {
  const auth = configuredAuth();
  if (!auth) {
    return Response.json({
      error: 'auth_not_configured',
      message: 'Owner sign-in is unavailable until OAuth secrets and the identity allowlist are bound.',
    }, { status: 503 });
  }
  return auth.handler(request);
};
