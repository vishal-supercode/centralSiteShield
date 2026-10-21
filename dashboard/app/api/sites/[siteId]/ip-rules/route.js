import { NextResponse } from "next/server";

export const runtime = "nodejs";
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
function configuration() {
  const apiUrl = process.env.SITESHIELD_API_URL;
  const token = process.env.SITESHIELD_ADMIN_TOKEN;
  if (!apiUrl || !token) return null;
  try {
    const parsed = new URL(apiUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return { apiUrl: parsed.origin, token };
  } catch { return null; }
}
async function forward(request, context, method) {
  if (method !== "GET" && !sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const { siteId } = await context.params;
  if (!/^site_[a-f0-9]{16}$/.test(siteId)) return json({ error: "Invalid site ID." }, 400);
  const config = configuration();
  if (!config) return json({ error: "Dashboard API configuration is incomplete." }, 503);
  const url = new URL(`/v1/sites/${siteId}/ip-rules`, config.apiUrl);
  if (method === "DELETE") {
    const ruleId = new URL(request.url).searchParams.get("ruleId");
    if (!ruleId || !/^[a-f0-9-]{36}$/i.test(ruleId)) return json({ error: "Invalid rule ID." }, 400);
    url.pathname += `/${ruleId}`;
  }
  let body;
  if (method === "POST") {
    try { body = await request.json(); } catch { return json({ error: "Enter an IP address and choose allow or block." }, 400); }
  }
  try {
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${config.token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => ({}));
    const status = response.ok ? response.status : [400, 404].includes(response.status) ? response.status : 502;
    return json(result, status);
  } catch { return json({ error: "Could not reach the central API." }, 502); }
}
export async function GET(request, context) { return forward(request, context, "GET"); }
export async function POST(request, context) { return forward(request, context, "POST"); }
export async function DELETE(request, context) { return forward(request, context, "DELETE"); }
