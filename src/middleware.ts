import { defineMiddleware } from 'astro:middleware';
import { configuredAuth } from '@/lib/server/runtime';

export const onRequest = defineMiddleware(async (context, next) => {
  const auth = configuredAuth();
  context.locals.authConfigured = Boolean(auth);
  context.locals.user = null;
  context.locals.session = null;

  if (auth) {
    try {
      const result = await auth.api.getSession({ headers: context.request.headers });
      context.locals.user = result?.user ?? null;
      context.locals.session = result?.session ?? null;
    } catch {
      // Public reading must continue if the identity store is temporarily unavailable.
    }
  }

  const response = await next();
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
});
