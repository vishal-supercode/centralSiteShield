"use client";

import { useEffect, useMemo, useState } from "react";

const tabs = [
  ["all", "All events"],
  ["block", "Blocked"],
  ["limit", "Rate limited"],
  ["monitor", "Monitor"],
];

export function CopyButton({ value, label = "Copy" }) {
  const [state, setState] = useState("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("failed");
      setTimeout(() => setState("idle"), 2500);
    }
  }
  return (
    <button
      type="button"
      className={
        state === "copied" ? "button button-success" : "button button-secondary"
      }
      onClick={copy}
    >
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed"
          : label}
    </button>
  );
}

function ConfirmAction({ site, action, onComplete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSite = action === "site";
  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/sites/${site.id}?action=${action === "logs" ? "logs" : "site"}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action failed.");
      setConfirming(false);
      onComplete(site.id, action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!confirming)
    return (
      <button
        type="button"
        className={isSite ? "button button-danger" : "button button-quiet"}
        onClick={() => setConfirming(true)}
      >
        {isSite ? "Delete site" : "Delete logs"}
      </button>
    );
  return (
    <span className="confirm-actions">
      <span className="confirm-label">
        {isSite ? "Delete site and all logs?" : "Delete all logs?"}
      </span>
      <button
        type="button"
        className="button button-danger"
        onClick={run}
        disabled={busy}
      >
        {busy ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => setConfirming(false)}
        disabled={busy}
      >
        Cancel
      </button>
      {error && <span className="inline-error">{error}</span>}
    </span>
  );
}

function downloadSiteEventsCsv(events, siteName, siteId) {
  const columns = [
    ["Time", (event) => event.timestamp],
    ["Site", () => siteName],
    ["Decision", (event) => event.decision],
    ["Method", (event) => event.request?.method],
    ["Path", (event) => event.request?.path],
    ["Source hash", (event) => event.request?.ip],
    ["Reasons", (event) => (event.reasons || []).join("; ")],
  ];
  const escapeCsv = (value) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [
    columns.map(([heading]) => escapeCsv(heading)).join(","),
    ...events.map((event) =>
      columns
        .map(([heading, getValue]) => {
          const value = getValue(event);
          if (heading === "Time") {
            const date = new Date(value);
            return escapeCsv(
              Number.isNaN(date.getTime()) ? value : date.toISOString(),
            );
          }
          return escapeCsv(value);
        })
        .join(","),
    ),
  ];
  const blob = new Blob(["\uFEFF", rows.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = (siteName || siteId).replace(/[^a-z0-9_-]+/gi, "-");
  anchor.href = url;
  anchor.download = `siteshield-${safeName}-events.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function DashboardClient({
  initialSites,
  initialEvents,
  initialSiteFilter = "all",
  showEvents = true,
  showSites = true,
}) {
  const [sites, setSites] = useState(initialSites);
  const [events, setEvents] = useState(initialEvents);
  const [activeTab, setActiveTab] = useState("all");
  const [siteFilter, setSiteFilter] = useState(initialSiteFilter);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);
  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          (siteFilter === "all" || event.siteId === siteFilter) &&
          (activeTab === "all" || event.decision === activeTab),
      ),
    [events, siteFilter, activeTab],
  );
  const counts = useMemo(() => {
    const scoped = events.filter(
      (event) => siteFilter === "all" || event.siteId === siteFilter,
    );
    return {
      all: scoped.length,
      block: scoped.filter((e) => e.decision === "block").length,
      limit: scoped.filter((e) => e.decision === "limit").length,
      monitor: scoped.filter((e) => e.decision === "monitor").length,
    };
  }, [events, siteFilter]);
  const names = useMemo(
    () => new Map(sites.map((site) => [site.id, site.name])),
    [sites],
  );
  function complete(siteId, action) {
    if (action === "site") {
      setSites((current) => current.filter((site) => site.id !== siteId));
      setEvents((current) =>
        current.filter((event) => event.siteId !== siteId),
      );
      if (siteFilter === siteId) setSiteFilter("all");
      setNotice("Site and its logs were deleted.");
    } else {
      setEvents((current) =>
        current.filter((event) => event.siteId !== siteId),
      );
      setNotice("Site logs were deleted.");
    }
    setTimeout(() => setNotice(""), 3000);
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/dashboard?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Refresh failed.");
      setSites(payload.sites);
      setEvents(payload.events);
      setRefreshedAt(payload.refreshedAt);
      setNotice("Dashboard refreshed from the central service.");
      setTimeout(() => setNotice(""), 3000);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Refresh failed.");
      setTimeout(() => setNotice(""), 4000);
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {showEvents && (
        <section className="toolbar-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>Security events</h2>
              {refreshedAt && (
                <p className="muted refresh-time">
                  Last refreshed {new Date(refreshedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  const siteEvents = events.filter(
                    (event) => event.siteId === siteFilter,
                  );
                  const selectedSite = sites.find(
                    (site) => site.id === siteFilter,
                  );
                  if (selectedSite) {
                    downloadSiteEventsCsv(
                      siteEvents,
                      selectedSite.name,
                      selectedSite.id,
                    );
                  }
                }}
                disabled={
                  siteFilter === "all" ||
                  !sites.some((site) => site.id === siteFilter)
                }
                title={
                  siteFilter === "all"
                    ? "Select an individual site to export its events."
                    : "Download this site's events as CSV"
                }
              >
                {siteFilter === "all" ||
                !sites.some((site) => site.id === siteFilter)
                  ? "⊘ Download CSV"
                  : "↓ Download CSV"}
              </button>
              <select
                className="site-select"
                value={siteFilter}
                onChange={(event) => setSiteFilter(event.target.value)}
              >
                <option value="all">All sites</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-primary"
                onClick={refresh}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>
          <div className="tabs" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={activeTab === key ? "tab active" : "tab"}
                key={key}
                onClick={() => setActiveTab(key)}
              >
                {label}
                <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="empty-state">No events match this filter.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Site</th>
                    <th>Decision</th>
                    <th>Request</th>
                    <th>Source hash</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event) => (
                    <tr key={event.id}>
                      <td>
                        {hydrated
                          ? new Date(event.timestamp).toLocaleString()
                          : new Date(event.timestamp).toISOString()}
                      </td>
                      <td>{names.get(event.siteId) || event.siteId}</td>
                      <td>
                        <span className={`badge badge-${event.decision}`}>
                          {event.decision}
                        </span>
                      </td>
                      <td>
                        <code>
                          {event.request.method} {event.request.path}
                        </code>
                      </td>
                      <td>
                        <code>{event.request.ip}</code>
                      </td>
                      <td>{event.reasons.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {showSites && (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Configuration</p>
              <h2>Registered sites</h2>
            </div>
            <span className="muted">{sites.length} connected</span>
          </div>
          {sites.length === 0 ? (
            <p className="empty-state">No sites registered yet.</p>
          ) : (
            <div className="site-grid">
              {sites.map((site) => (
                <article className="site-card" key={site.id}>
                  <div className="site-card-top">
                    <div>
                      <h3>{site.name}</h3>
                      <a href={site.origin} target="_blank" rel="noreferrer">
                        {site.origin}
                      </a>
                    </div>
                    <span className="site-dot" />
                  </div>
                  <p className="site-id-label">Site ID</p>
                  <div className="copy-line">
                    <code>{site.id}</code>
                    <CopyButton value={site.id} label="Copy ID" />
                  </div>
                  <div className="site-actions">
                    <ConfirmAction
                      site={site}
                      action="logs"
                      onComplete={complete}
                    />
                    <ConfirmAction
                      site={site}
                      action="site"
                      onComplete={complete}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
