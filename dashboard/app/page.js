import RegisterSite from './register-site';

const apiUrl = process.env.SITESHIELD_API_URL || 'http://127.0.0.1:4000';
const token = process.env.SITESHIELD_ADMIN_TOKEN;

async function get(path) {
  if (!token) return { error: 'Set SITESHIELD_ADMIN_TOKEN for the dashboard server.' };
  try {
    const response = await fetch(`${apiUrl}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) return { error: `Central API returned HTTP ${response.status}.` };
    return await response.json();
  } catch {
    return { error: 'Cannot connect to the central API. Confirm it is running and SITESHIELD_API_URL is correct.' };
  }
}

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const siteId = typeof params?.siteId === 'string' ? params.siteId : undefined;
  const [siteResult, eventResult] = await Promise.all([
    get('/v1/sites'),
    get(`/v1/events?limit=100${siteId ? `&siteId=${encodeURIComponent(siteId)}` : ''}`),
  ]);
  if (siteResult.error || eventResult.error) return <main><h1>SiteShield security reports</h1><p role="alert">{siteResult.error || eventResult.error}</p><p>Start the central API and check the dashboard server environment settings.</p></main>;
  const sites = siteResult.sites;
  const events = eventResult.events;
  const counts = { block: 0, limit: 0, monitor: 0, allow: 0 };
  for (const event of events) if (event.decision in counts) counts[event.decision]++;
  const siteNames = new Map(sites.map((site) => [site.id, site.name]));
  return <main>
    <header><h1>SiteShield security reports</h1><p>Latest 100 recorded events{siteId ? ` for ${siteNames.get(siteId) || siteId}` : ' across your registered sites'}.</p><a href="/">Clear site filter</a></header>
    <section aria-label="Event summary" className="summary">
      <article><h2>Sites</h2><p>{sites.length}</p></article><article><h2>Blocked</h2><p>{counts.block}</p></article><article><h2>Rate-limited</h2><p>{counts.limit}</p></article><article><h2>Monitor only</h2><p>{counts.monitor}</p></article>
    </section>
    <RegisterSite />
    <section><h2>Registered sites</h2>{sites.length === 0 ? <p>No sites registered yet.</p> : <ul>{sites.map((site) => <li key={site.id}><a href={`/?siteId=${encodeURIComponent(site.id)}`}>{site.name}</a> — {site.origin} <small>({site.id})</small></li>)}</ul>}</section>
    <section><h2>Recent events</h2>{events.length === 0 ? <p>No security events recorded for this selection.</p> : <div className="table-wrap"><table><thead><tr><th>Time</th><th>Site</th><th>Decision</th><th>Request</th><th>Source hash</th><th>Reason</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.timestamp).toLocaleString()}</td><td>{siteNames.get(event.siteId) || event.siteId}</td><td>{event.decision}</td><td>{event.request.method} {event.request.path}</td><td><code>{event.request.ip}</code></td><td>{event.reasons.join(', ') || '—'}</td></tr>)}</tbody></table></div>}</section>
    <footer><p>Source IP addresses are stored as keyed hashes. Counts summarize only the latest 100 events, not lifetime totals.</p></footer>
  </main>;
}
