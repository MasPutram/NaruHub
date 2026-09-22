"use client";

import { useEffect, useState, useCallback } from "react";

interface CookieEntry {
  pkg: string;
  username: string;
  cookie: string;
  deviceId: string;
  updatedAt: number;
  loggedOut?: boolean;
  loggedOutAt?: number;
}

function ago(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "unknown";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export default function CookiesPage() {
  const [cookies, setCookies] = useState<CookieEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [loggingOut, setLoggingOut] = useState<string | null>(null);
  const [logoutResult, setLogoutResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const fetchCookies = useCallback(async () => {
    try {
      const res = await fetch("/api/device-control/cookies");
      const data = await res.json();
      if (data.ok) setCookies(data.cookies || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCookies();
    const iv = setInterval(fetchCookies, 10000);
    return () => clearInterval(iv);
  }, [fetchCookies]);

  const toggle = (pkg: string) =>
    setExpanded((prev) => (prev === pkg ? null : pkg));

  const copyToClip = async (text: string, pkg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(pkg);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const triggerExtract = async () => {
    setExtracting(true);
    try {
      await fetch("/api/device-control/cookies/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {}
    setTimeout(() => {
      setExtracting(false);
      fetchCookies();
    }, 8000);
  };

  const handleLogout = async (pkg: string) => {
    if (!confirm(`Logout session untuk ${pkg}?`)) return;
    setLoggingOut(pkg);
    setLogoutResult((prev) => ({ ...prev, [pkg]: { ok: false, msg: "..." } }));
    try {
      const res = await fetch("/api/device-control/cookies/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pkg }),
      });
      const data = await res.json();
      if (data.ok) {
        setLogoutResult((prev) => ({ ...prev, [pkg]: { ok: true, msg: "Logged out!" } }));
        fetchCookies();
      } else {
        setLogoutResult((prev) => ({ ...prev, [pkg]: { ok: false, msg: data.error || `HTTP ${data.httpStatus}` } }));
      }
    } catch (e: any) {
      setLogoutResult((prev) => ({ ...prev, [pkg]: { ok: false, msg: e.message } }));
    }
    setLoggingOut(null);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        .ck-page h1 { font-size: 1.5rem; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .ck-page .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 20px; }
        .ck-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .ck-extract-btn {
          background: #7c3aed; color: #fff; border: none; padding: 8px 20px;
          border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
          transition: background 0.15s;
        }
        .ck-extract-btn:hover { background: #6d28d9; }
        .ck-extract-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ck-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 10px;
        }
        .ck-card {
          background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 10px;
          overflow: hidden; transition: border-color 0.15s; cursor: pointer;
        }
        .ck-card:hover { border-color: #3a3a5e; }
        .ck-card.active { border-color: #7c3aed; grid-column: 1 / -1; cursor: default; }
        .ck-card.logged-out { opacity: 0.5; }
        .ck-header { padding: 12px 14px; }
        .ck-header-top { display: flex; align-items: center; justify-content: space-between; }
        .ck-username { color: #a78bfa; font-weight: 600; font-size: 0.95rem; }
        .ck-badge {
          font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; font-weight: 600;
        }
        .ck-badge-active { background: #16a34a22; color: #4ade80; }
        .ck-badge-out { background: #dc262622; color: #f87171; }
        .ck-row2 { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
        .ck-pkg-label { color: #555; font-size: 0.7rem; font-family: monospace; }
        .ck-meta { display: flex; align-items: center; gap: 8px; }
        .ck-device-tag {
          background: #222; color: #888; font-size: 0.65rem; padding: 1px 6px;
          border-radius: 4px; font-family: monospace;
        }
        .ck-time-tag { color: #555; font-size: 0.65rem; }
        .ck-body { padding: 0 14px 12px; border-top: 1px solid #2a2a3e; }
        .ck-label { color: #666; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 6px; }
        .ck-cookie-box {
          background: #111; border: 1px solid #333; border-radius: 8px;
          padding: 10px 12px; font-family: monospace; font-size: 0.72rem;
          color: #aaa; word-break: break-all; line-height: 1.5;
          max-height: 100px; overflow-y: auto;
        }
        .ck-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .ck-copy-btn {
          background: #333; color: #ccc; border: 1px solid #444; padding: 5px 14px;
          border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 500;
          transition: all 0.15s;
        }
        .ck-copy-btn:hover { background: #444; color: #fff; }
        .ck-copy-btn.copied { background: #16a34a; color: #fff; border-color: #16a34a; }
        .ck-logout-btn {
          background: #dc2626; color: #fff; border: none; padding: 5px 14px;
          border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600;
          transition: all 0.15s;
        }
        .ck-logout-btn:hover { background: #b91c1c; }
        .ck-logout-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ck-close-btn {
          background: none; color: #666; border: 1px solid #444; padding: 5px 14px;
          border-radius: 6px; cursor: pointer; font-size: 0.75rem; transition: all 0.15s;
        }
        .ck-close-btn:hover { color: #fff; border-color: #666; }
        .ck-result { font-size: 0.75rem; padding: 4px 0; }
        .ck-result-ok { color: #4ade80; }
        .ck-result-fail { color: #f87171; }
        .ck-empty { text-align: center; color: #666; padding: 40px; font-size: 0.9rem; }
        .ck-count { color: #666; font-size: 0.8rem; }
      `}</style>
      <div className="ck-page">
        <h1>Cookies</h1>
        <p className="subtitle">.ROBLOSECURITY cookies dari clone devices</p>
        <div className="ck-top">
          <span className="ck-count">{!loading && cookies.length > 0 ? `${cookies.length} akun` : ""}</span>
          <button
            className="ck-extract-btn"
            onClick={triggerExtract}
            disabled={extracting}
          >
            {extracting ? "Extracting..." : "Extract Cookies"}
          </button>
        </div>

        {loading ? (
          <div className="ck-empty">Loading...</div>
        ) : cookies.length === 0 ? (
          <div className="ck-empty">
            Belum ada cookies. Klik "Extract Cookies" untuk ambil dari device.
          </div>
        ) : (
          <div className="ck-grid">
            {cookies.map((c) => {
              const isOpen = expanded === c.pkg;
              const result = logoutResult[c.pkg];
              return (
                <div
                  className={`ck-card ${isOpen ? "active" : ""} ${c.loggedOut ? "logged-out" : ""}`}
                  key={c.pkg}
                  onClick={() => !isOpen && toggle(c.pkg)}
                >
                  <div className="ck-header">
                    <div className="ck-header-top">
                      <span className="ck-username">{c.username || c.pkg.replace("com.roblox.", "")}</span>
                      <span className={`ck-badge ${c.loggedOut ? "ck-badge-out" : "ck-badge-active"}`}>
                        {c.loggedOut ? "Logged Out" : "Active"}
                      </span>
                    </div>
                    <div className="ck-row2">
                      <span className="ck-pkg-label">{c.pkg.replace("com.roblox.", "")}</span>
                      <div className="ck-meta">
                        <span className="ck-device-tag">{c.deviceId?.substring(0, 8)}</span>
                        <span className="ck-time-tag">{ago(c.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="ck-body">
                      <div className="ck-label">Cookie</div>
                      <div className="ck-cookie-box">{c.cookie}</div>
                      <div className="ck-actions">
                        <button
                          className={`ck-copy-btn ${copied === c.pkg ? "copied" : ""}`}
                          onClick={(e) => { e.stopPropagation(); copyToClip(c.cookie, c.pkg); }}
                        >
                          {copied === c.pkg ? "Copied!" : "Copy Cookie"}
                        </button>
                        {!c.loggedOut && (
                          <button
                            className="ck-logout-btn"
                            disabled={loggingOut === c.pkg}
                            onClick={(e) => { e.stopPropagation(); handleLogout(c.pkg); }}
                          >
                            {loggingOut === c.pkg ? "Logging out..." : "Logout Session"}
                          </button>
                        )}
                        <button
                          className="ck-close-btn"
                          onClick={(e) => { e.stopPropagation(); setExpanded(null); }}
                        >
                          Close
                        </button>
                      </div>
                      {result && (
                        <div className={`ck-result ${result.ok ? "ck-result-ok" : "ck-result-fail"}`}>
                          {result.msg}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
