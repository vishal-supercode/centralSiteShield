import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!origin || !host) return json({ error: 'Invalid request origin.' }, 403);
  try {
    if (new URL(origin).host !== host) return json({ error: 'Invalid request origin.' }, 403);
  } catch {
    return json({ error: 'Invalid request origin.' }, 403);
  }

  let input;
  try { input = await request.json(); }
  catch { return json({ error: 'Enter a valid site name and URL.' }, 400); }
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const originUrl = typeof input?.origin === 'string' ? input.origin.trim() : '';
  let parsedOrigin;
  try { parsedOrigin = new URL(originUrl); } catch { /* validated below */ }
  if (!name || name.length > 128 || !parsedOrigin || !['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
    return json({ error: 'Use a site name and a plain http(s) origin, such as https://www.example.com.' }, 400);
  }

  const configuredApiUrl = process.env.SITESHIELD_API_URL || 'http://127.0.0.1:4000';
  let apiUrl;
  try {
    const parsedApiUrl = new URL(configuredApiUrl);
    if (!['http:', 'https:'].includes(parsedApiUrl.protocol) || parsedApiUrl.username || parsedApiUrl.password || parsedApiUrl.search || parsedApiUrl.hash) throw new Error();
    apiUrl = parsedApiUrl.origin;
  } catch {
    return json({ error: 'SITESHIELD_API_URL must be a plain HTTP(S) service URL.' }, 503);
  }
  const token = process.env.SITESHIELD_ADMIN_TOKEN;
  if (!token) return json({ error: 'Dashboard server is missing its central API token.' }, 503);
  try {
    const response = await fetch(`${apiUrl}/v1/sites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, origin: parsedOrigin.origin }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: response.status === 400 ? 'The central API rejected this site name or URL.' : `Central API returned HTTP ${response.status}.` }, response.status === 400 ? 400 : 502);
    if (!result.site?.id || typeof result.apiKey !== 'string') return json({ error: 'Central API returned an invalid registration response.' }, 502);
    return json({ site: result.site, apiKey: result.apiKey, apiUrl });
  } catch {
    return json({ error: 'Could not reach the central API. Check that it is running and SITESHIELD_API_URL is correct.' }, 502);
  }
}
