import { env } from 'cloudflare:workers';
import { createAuth, isAuthConfigured, type AuthEnvironment } from './auth';

export function runtimeEnvironment(): AuthEnvironment {
  return env as AuthEnvironment;
}

export function configuredAuth() {
  const environment = runtimeEnvironment();
  return isAuthConfigured(environment) ? createAuth(environment) : null;
}

export async function currentOwner(request: Request) {
  const auth = configuredAuth();
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  return session ?? null;
}

export function database() {
  const environment = runtimeEnvironment();
  if (!environment.DB) throw new Error('D1 binding DB is unavailable.');
  return environment.DB;
}
