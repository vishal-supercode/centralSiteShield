import RegisterSite from './register-site';
import DashboardClient from './dashboard-client';

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
  const [siteResult, eventResult] = await Promise.all([get('/v1/sites'), get('/v1/events?limit=100')]);
  if (siteResult.error || eventResult.error) return <main><h1>SiteShield security reports</h1><p role="alert">{siteResult.error || eventResult.error}</p><p>Start the central API and check the dashboard server environment settings.</p></main>;
  const sites = siteResult.sites;
  const events = eventResult.events;
  return <main>
    <header><p className="eyebrow">Operations console</p><h1>SiteShield security reports</h1><p>Monitor suspicious traffic, protect your connected sites, and manage event history.</p></header>
    <RegisterSite />
    <DashboardClient initialSites={sites} initialEvents={events} initialSiteFilter={siteId || 'all'} />
    <footer><p>Source IP addresses are stored as keyed hashes. Counts summarize only the latest 100 events, not lifetime totals.</p></footer>
  </main>;
}
