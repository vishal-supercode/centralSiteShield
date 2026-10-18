import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function DELETE(request, { params }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const { siteId } = await params;
  if (!/^site_[a-f0-9]{16}$/.test(siteId)) return NextResponse.json({ error: 'Invalid site ID.' }, { status: 400 });
  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'logs' && action !== 'site') return NextResponse.json({ error: 'Invalid deletion action.' }, { status: 400 });
  const apiUrl = process.env.SITESHIELD_API_URL;
  const token = process.env.SITESHIELD_ADMIN_TOKEN;
  if (!apiUrl || !token) return NextResponse.json({ error: 'Dashboard API configuration is incomplete.' }, { status: 503 });
  try {
    const endpoint = action === 'logs' ? `/v1/sites/${siteId}/events` : `/v1/sites/${siteId}`;
    const response = await fetch(`${apiUrl}${endpoint}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const result = await response.json().catch(() => ({}));
    return NextResponse.json(result, { status: response.ok ? 200 : response.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not reach the central API.' }, { status: 502 });
  }
}
