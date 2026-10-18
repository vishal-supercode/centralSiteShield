# SiteShield dashboard

This standalone Next.js app shows sites and recent event reports from the central API. It fetches API data on the server; the admin token is never sent to the browser. Basic authentication is enabled by `proxy.js` for all pages. This is an MVP access gate, not team identity management; production deployment needs HTTPS, a private network or proper SSO, and managed secrets.

The dashboard runs at `http://127.0.0.1:3001` to avoid the separate demo site's port 3000.

Configure `.env.local` from `.env.example`, matching `SITESHIELD_ADMIN_TOKEN` with the API `.env`. Keep the dashboard password separate from the API admin token.
