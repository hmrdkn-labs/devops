import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ locals }) => Response.json({
  authenticated: Boolean(locals.user),
  authConfigured: locals.authConfigured,
  user: locals.user ? {
    id: locals.user.id,
    name: locals.user.name,
    image: locals.user.image,
  } : null,
});
