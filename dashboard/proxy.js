import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function proxy(request) {
  const password = process.env.SITESHIELD_DASHBOARD_PASSWORD;
  if (!password)
    return new NextResponse("Dashboard password is not configured.", {
      status: 503,
    });
  const authorization = request.headers.get("authorization") ?? "";
  let supplied = "";
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString(
        "utf8",
      );
      const separator = decoded.indexOf(":");
      if (separator >= 0) supplied = decoded.slice(separator + 1);
    } catch {
      /* malformed auth is rejected below */
    }
  }
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(password);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="SiteShield dashboard"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
