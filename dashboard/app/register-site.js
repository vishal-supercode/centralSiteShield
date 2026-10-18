'use client';

import { useState } from 'react';

export default function RegisterSite() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setResult(null); setCopied(false); setBusy(true);
    const form = event.currentTarget;
    try {
      const response = await fetch('/api/sites', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.elements.name.value, origin: form.elements.origin.value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Registration failed (HTTP ${response.status}).`);
      setResult(payload); form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed.');
    } finally { setBusy(false); }
  }

  const envSnippet = result ? `SITESHIELD_API_URL=${result.apiUrl}\nSITESHIELD_SITE_KEY=${result.apiKey}` : '';
  const localDemo = result && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(result.site.origin).hostname);
  const ipResolver = localDemo
    ? `  // Local demonstration only. Never use this fixed IP in production.\n  getClientIp: () => '127.0.0.1',`
    : `  // Replace with a client-IP value sanitized by your hosting proxy.\n  getClientIp: (request) => request.headers.get('x-company-client-ip') ?? undefined,`;
  const integrationSnippet = result ? `import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { createGooglebotVerifier } from 'siteshield/crawlers';
import { createBatchApiEventReporter, createNextShield } from 'siteshield/next';

const reporter = createBatchApiEventReporter({
  apiUrl: process.env.SITESHIELD_API_URL!,
  siteKey: process.env.SITESHIELD_SITE_KEY!,
  batchSize: 20,
  maxQueueSize: 200,
});

const shield = createNextShield({
  siteId: '${result.site.id}',
  policy: {
    mode: 'monitor',
    maxRequests: 30,
    windowMs: 60_000,
    // Only verified Google crawlers get the public GET/HEAD exemption.
    // Login, admin, and mutation requests remain protected.
    trustedCrawler: createGooglebotVerifier(),
  },
${ipResolver}
  eventReporter: reporter,
});

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  return (await shield(request, event)) ?? NextResponse.next();
}

export const config = { matcher: ['/api/:path*', '/login'] };` : '';

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); setCopied(true); }
    catch { setError('Clipboard access failed. Select and copy the displayed text manually.'); }
  }

  return <section id="register-site">
    <h2>Register a site</h2>
    <p>Add the site origin used by the application. The generated key is shown once; copy it to your project’s server-side environment variables.</p>
    <form onSubmit={submit} className="register-form">
      <label>Site name<input name="name" required maxLength={128} placeholder="Marketing website" /></label>
      <label>Site origin<input name="origin" required type="url" placeholder="https://www.example.com" /></label>
      <button type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register site'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div className="setup-result" aria-live="polite">
      <h3>Site registered — save this key now</h3>
      <p>Site key (shown only once):</p><code className="secret-key">{result.apiKey}</code>
      <p>This credential can report events for this site. Keep it on the server; never prefix it with <code>NEXT_PUBLIC_</code>. If lost, register a replacement key through a future key-rotation flow.</p>
      <h3>Environment values</h3><pre>{envSnippet}</pre><button type="button" onClick={() => copy(envSnippet)}>Copy environment values</button>
      <h3>Next.js integration example</h3><p>Install <code>siteshield</code>, save the environment values in the app server’s environment, and adapt this example to your trusted proxy IP header and routes. Start in monitor mode.</p>
      <pre>{integrationSnippet}</pre><button type="button" onClick={() => copy(integrationSnippet)}>Copy integration example</button>
      {copied && <p role="status">Copied to clipboard.</p>}
    </div>}
  </section>;
}
