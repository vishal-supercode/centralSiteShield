"use client";

import { useEffect, useState } from "react";

export default function IpListManager({ sites, initialSiteId }) {
  const [siteId, setSiteId] = useState(initialSiteId || sites[0]?.id || "");
  const [rules, setRules] = useState([]);
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRules(selectedSiteId = siteId) {
    if (!selectedSiteId) { setRules([]); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sites/${selectedSiteId}/ip-rules`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load IP rules.");
      setRules(result.rules || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load IP rules.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadRules(siteId); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [siteId]);

  async function add(type) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/sites/${siteId}/ip-rules`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), type }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this IP rule.");
      setIp(""); await loadRules();
      setMessage(type === "allow" ? "IP added to the allowlist." : "IP added to the blocklist.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this IP rule.");
    } finally { setBusy(false); }
  }

  async function remove(rule) {
    if (!window.confirm(`Remove ${rule.ip} from the ${rule.type}list?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/sites/${siteId}/ip-rules?ruleId=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not remove this IP rule.");
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setMessage("IP rule removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this IP rule.");
    }
  }

  const allowRules = rules.filter((rule) => rule.type === "allow");
  const blockRules = rules.filter((rule) => rule.type === "block");
  return (
    <section className="ip-manager" aria-labelledby="ip-manager-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Access control</p>
          <h2 id="ip-manager-title">IP allowlist &amp; blocklist</h2>
          <p className="muted">Allowlisted IPs bypass SiteShield limits. Blocklisted IPs are denied immediately.</p>
        </div>
        <select className="site-select" aria-label="Choose site for IP rules" value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={!sites.length}>
          {!sites.length && <option value="">No sites registered</option>}
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
      </div>
      {sites.length > 0 && (
        <form className="ip-rule-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="ip-rule-input">IPv4 or IPv6 address</label>
          <div className="ip-rule-controls">
            <input id="ip-rule-input" value={ip} onChange={(event) => setIp(event.target.value)} placeholder="203.0.113.10" autoComplete="off" />
            <button className="button button-success" type="button" disabled={busy || !ip.trim()} onClick={() => add("allow")}>{busy ? "Saving…" : "Add to allowlist"}</button>
            <button className="button button-danger" type="button" disabled={busy || !ip.trim()} onClick={() => add("block")}>{busy ? "Saving…" : "Add to blocklist"}</button>
          </div>
          <p className="muted">Adding an existing address to the other list moves it there. Rules are site-specific.</p>
        </form>
      )}
      {message && <p className="inline-success" role="status">{message}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading ? <p className="empty-state">Loading IP rules…</p> : (
        <div className="ip-rule-columns">
          <IpRuleList title="Allowed" type="allow" rules={allowRules} onRemove={remove} />
          <IpRuleList title="Blocked" type="block" rules={blockRules} onRemove={remove} />
        </div>
      )}
      <p className="muted policy-refresh-note">Only actual `block` decisions create automatic entries; monitor mode records detections but does not auto-block them. Connected apps refresh rules about once per minute, so changes may take up to a minute to reach every running instance.</p>
    </section>
  );
}

function IpRuleList({ title, type, rules, onRemove }) {
  return (
    <div className={`ip-rule-list ip-rule-list-${type}`}>
      <div className="ip-rule-list-heading"><h3>{title}</h3><span>{rules.length}</span></div>
      {rules.length === 0 ? <p className="muted">No IP addresses here.</p> : (
        <ul>{rules.map((rule) => (
          <li key={rule.id}>
            <code>{rule.ip}</code>
            <span className="ip-rule-source">{rule.source === "automatic" ? "Auto-blocked" : "Manual"}</span>
            <button className="button button-quiet" type="button" onClick={() => onRemove(rule)}>Remove</button>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
