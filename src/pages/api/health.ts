import type { APIRoute } from 'astro';
import manifest from '@/generated/content-manifest.json';
import { runtimeEnvironment } from '@/lib/server/runtime';

export const GET: APIRoute = async () => {
  const environment = runtimeEnvironment();
  let databaseStatus: 'ready' | 'unbound' | 'error' = 'unbound';
  if (environment.DB) {
    try {
      await environment.DB.prepare('SELECT 1 AS ok').first();
      databaseStatus = 'ready';
    } catch {
      databaseStatus = 'error';
    }
  }
  return Response.json({
    status: databaseStatus === 'error' ? 'degraded' : 'ok',
    database: databaseStatus,
    manifestSha: manifest.manifest_sha256,
    contentVersion: manifest.content_version,
  }, {
    status: databaseStatus === 'error' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
};
