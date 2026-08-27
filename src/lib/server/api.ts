export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function unauthorized() {
  return json({ error: 'authentication_required' }, { status: 401 });
}

export async function requestJson(request: Request, maxBytes = 100_000) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new Error('request_too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('request_too_large');
  return JSON.parse(text) as unknown;
}

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{12,160}$/.test(value);
}
