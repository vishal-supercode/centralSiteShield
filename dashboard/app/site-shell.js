"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Overview", icon: "⌂" },
  { href: "/configuration", label: "Configuration", icon: "⚙" },
  { href: "/access-control", label: "Access Control", icon: "⛨" },
];

export default function SiteShell({ children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`app-sidebar ${open ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">S</span>
          <span>
            <strong>SiteShield</strong>
            <small>Central console</small>
          </span>
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {active && <span className="nav-indicator" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Central service dashboard
        </div>
      </aside>
      <div className="app-content">
        <div className="mobile-topbar">
          <button
            type="button"
            className="menu-toggle"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "×" : "☰"}
          </button>
          <Link
            href="/"
            className="mobile-brand"
            onClick={() => setOpen(false)}
          >
            SiteShield
          </Link>
          <span className="mobile-status" aria-label="Central console">
            <span className="status-dot" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
