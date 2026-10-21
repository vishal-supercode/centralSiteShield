"use client";

import { useState } from "react";
import { CopyButton } from "./dashboard-client";

export default function RegisterSite() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupTab, setSetupTab] = useState("env");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setSetupTab("env");
    setBusy(true);
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.elements.name.value,
          origin: form.elements.origin.value,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error || `Registration failed (HTTP ${response.status}).`,
        );
      setResult(payload);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  const envSnippet = result
    ? `SITESHIELD_API_URL=${result.apiUrl}\nSITESHIELD_SITE_KEY=${result.apiKey}\n\n# Optional but recommended for production shared rate limits\nUPSTASH_REDIS_REST_URL=https://your-database.upstash.io\nUPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token\n\n#uncomment when in production\n#NODE_ENV=production`
    : "";
  const ipResolver = `  // Local development uses loopback; production reads the client IP from the hosting proxy.
  getClientIp: (request) => {
    if (process.env.NODE_ENV !== 'production') return '127.0.0.1';
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  },`;
  const integrationSnippet = result
    ? `import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { createGooglebotVerifier } from 'siteshield/crawlers';
import { createApiIpListProvider, createBatchApiEventReporter, createNextShield } from 'siteshield/next';
import { createUpstashCounterStore } from 'siteshield/counters';

const reporter = createBatchApiEventReporter({
  apiUrl: process.env.SITESHIELD_API_URL!,
  siteKey: process.env.SITESHIELD_SITE_KEY!,
  batchSize: 20,
  maxQueueSize: 200,
});
const ipListProvider = createApiIpListProvider(
  process.env.SITESHIELD_API_URL!,
  process.env.SITESHIELD_SITE_KEY!,
);
const counterStore = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? createUpstashCounterStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN, { prefix: 'siteshield:${result.site.id}:' })
  : undefined;

const shield = createNextShield({
  siteId: '${result.site.id}',
  policy: {
    mode: 'monitor',
    maxRequests: 50,
    windowMs: 30_000,
    // Only verified Google crawlers get the public GET/HEAD exemption.
    // Login, admin, and mutation requests remain protected.
    trustedCrawler: createGooglebotVerifier(),
  },
${ipResolver}
  eventReporter: reporter,
  ipListProvider,
  counterStore,
});

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  return (await shield(request, event)) ?? NextResponse.next();
}

export const config = { matcher: ['/', '/api/:path*', '/login'] };`
    : "";

  return (
    <section id="register-site" className="register-panel">
      <div className="register-intro">
        <div>
          <p className="eyebrow">Site management</p>
          <h2>Register a site</h2>
          <p className="muted">
            Connect an application to SiteShield and get the setup values for its
            server-side environment and Next.js proxy.
          </p>
        </div>
        <span className="register-intro-icon" aria-hidden="true">＋</span>
      </div>

      <form onSubmit={submit} className="register-form">
        <label>
          Site name
          <input
            name="name"
            required
            maxLength={128}
            placeholder="Marketing website"
          />
        </label>
        <label>
          Site origin
          <input
            name="origin"
            required
            type="url"
            placeholder="https://www.example.com"
          />
        </label>
        <button type="submit" className="button button-primary register-submit" disabled={busy}>
          {busy ? "Registering…" : "Register site"}
        </button>
      </form>

      {error && <p className="register-error" role="alert">{error}</p>}

      {result && (
        <div className="setup-result setup-workspace" aria-live="polite">
          <div className="setup-success-banner">
            <span className="success-mark" aria-hidden="true">✓</span>
            <div>
              <p className="eyebrow">Registration successful</p>
              <h3>Your site is ready to configure</h3>
              <p className="muted">Follow the steps below to connect your application.</p>
            </div>
          </div>

          <div className="setup-credential-card">
            <div className="setup-card-heading">
              <div>
                <span className="setup-step">SECURITY KEY</span>
                <h4>Site key</h4>
                <p>Keep this private. It belongs in server-side environment variables only.</p>
              </div>
              <span className="setup-lock" aria-hidden="true">⌑</span>
            </div>
            <code className="secret-key">{result.apiKey}</code>
            <div className="setup-key-actions">
              <CopyButton value={result.apiKey} label="Copy site key" />
              <span className="setup-private-note">Private credential · shown once</span>
            </div>
          </div>

          <div className="setup-site-id">
            <div>
              <span className="setup-step">SITE ID</span>
              <code>{result.site.id}</code>
            </div>
            <CopyButton value={result.site.id} label="Copy ID" />
          </div>

          <div className="setup-guide-heading">
            <div>
              <p className="eyebrow">Next steps</p>
              <h3>Finish your integration</h3>
            </div>
            <span className="setup-guide-count">2 steps</span>
          </div>

          <div className="setup-tabs" role="tablist" aria-label="Site setup instructions">
            <button
              type="button"
              role="tab"
              id="setup-tab-env"
              aria-selected={setupTab === "env"}
              aria-controls="setup-panel"
              className={setupTab === "env" ? "setup-tab active" : "setup-tab"}
              onClick={() => setSetupTab("env")}
            >
              <span className="setup-tab-number">1</span>
              <span><strong>Environment</strong><small>Add your credentials</small></span>
            </button>
            <button
              type="button"
              role="tab"
              id="setup-tab-proxy"
              aria-selected={setupTab === "proxy"}
              aria-controls="setup-panel"
              className={setupTab === "proxy" ? "setup-tab active" : "setup-tab"}
              onClick={() => setSetupTab("proxy")}
            >
              <span className="setup-tab-number">2</span>
              <span><strong>Next.js proxy</strong><small>Connect the protection layer</small></span>
            </button>
          </div>

          <div className="setup-instruction-panel" id="setup-panel" role="tabpanel" aria-labelledby={setupTab === "env" ? "setup-tab-env" : "setup-tab-proxy"}>
            {setupTab === "env" ? (
              <>
                <div className="setup-panel-heading">
                  <div>
                    <h4>Add environment values</h4>
                    <p>Paste these into the server-side <code>.env</code> file at your project root.</p>
                  </div>
                  <CopyButton value={envSnippet} label="Copy values" />
                </div>
                <pre className="setup-code">{envSnippet}</pre>
                <p className="setup-tip"><span aria-hidden="true">ⓘ</span> Do not prefix these variables with <code>NEXT_PUBLIC_</code> or commit your <code>.env</code> file.</p>
                <div className="setup-panel-footer">
                  <span>Environment configured?</span>
                  <button type="button" className="button button-primary" onClick={() => setSetupTab("proxy")}>Next: proxy setup <span aria-hidden="true">→</span></button>
                </div>
              </>
            ) : (
              <>
                <div className="setup-panel-heading">
                  <div>
                    <h4>Configure Next.js proxy</h4>
                    <p>Create or replace <code>src/proxy.ts</code> in your Next.js project.</p>
                  </div>
                  <CopyButton value={integrationSnippet} label="Copy proxy.ts" />
                </div>
                <div className="setup-file-label"><span className="setup-file-icon" aria-hidden="true">TS</span><code>src/proxy.ts</code><span>TypeScript</span></div>
                <pre className="setup-code setup-proxy-code">{integrationSnippet}</pre>
                <p className="setup-tip"><span aria-hidden="true">ⓘ</span> Install the <code>siteshield</code> package first. The example starts in monitor mode so you can validate events before enforcing policy.</p>
                <div className="setup-panel-footer">
                  <button type="button" className="button button-secondary" onClick={() => setSetupTab("env")}><span aria-hidden="true">←</span> Back to environment</button>
                  <span>Setup snippets are ready to copy</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
