import "./globals.css";
import SiteShell from "./site-shell";

export const metadata = {
  title: "SiteShield | Central console",
  description: "SiteShield security dashboard and access controls",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
