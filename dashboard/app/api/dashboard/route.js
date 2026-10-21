import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const apiUrl = process.env.SITESHIELD_API_URL || "http://127.0.0.1:4000";
  const token = process.env.SITESHIELD_ADMIN_TOKEN;
  if (!token)
    return NextResponse.json(
      { error: "Dashboard API configuration is incomplete." },
      { status: 503 },
    );
  try {
    const headers = { authorization: `Bearer ${token}` };
    const [sitesResponse, eventsResponse] = await Promise.all([
      fetch(`${apiUrl}/v1/sites`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${apiUrl}/v1/events?limit=100&_=${Date.now()}`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }),
    ]);
    if (!sitesResponse.ok || !eventsResponse.ok)
      return NextResponse.json(
        { error: "Central API returned an error while refreshing." },
        { status: 502 },
      );
    const [sites, events] = await Promise.all([
      sitesResponse.json(),
      eventsResponse.json(),
    ]);
    return NextResponse.json(
      {
        sites: sites.sites ?? [],
        events: events.events ?? [],
        refreshedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach the central API while refreshing." },
      { status: 502 },
    );
  }
}
