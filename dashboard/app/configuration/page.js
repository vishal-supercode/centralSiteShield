import RegisterSite from "../register-site";
import DashboardClient from "../dashboard-client";

const apiUrl = process.env.SITESHIELD_API_URL || "http://127.0.0.1:4000";
const token = process.env.SITESHIELD_ADMIN_TOKEN;

async function getSites() {
  if (!token)
    return { error: "Set SITESHIELD_ADMIN_TOKEN for the dashboard server." };
  try {
    const response = await fetch(`${apiUrl}/v1/sites`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok)
      return { error: `Central API returned HTTP ${response.status}.` };
    return await response.json();
  } catch {
    return {
      error:
        "Cannot connect to the central API. Confirm it is running and SITESHIELD_API_URL is correct.",
    };
  }
}

export default async function ConfigurationPage() {
  const result = await getSites();
  return (
    <main>
      <header>
        <p className="eyebrow">Workspace settings</p>
        <h1>Configuration</h1>
        <p>Register websites and manage their SiteShield connection details.</p>
      </header>
      {result.error ? (
        <section>
          <p role="alert">{result.error}</p>
          <p>
            Start the central API and check the dashboard server environment
            settings.
          </p>
        </section>
      ) : (
        <>
          <RegisterSite />
          <DashboardClient
            initialSites={result.sites}
            initialEvents={[]}
            showEvents={false}
            showSites
          />
        </>
      )}
    </main>
  );
}
