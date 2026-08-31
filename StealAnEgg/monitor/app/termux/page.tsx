"use client";

import { useEffect, useState, useCallback } from "react";

interface TermuxDevice {
  deviceId: string;
  hostname: string;
  platform: string;
  status: string;
  registeredAt: number;
  lastSeen: number;
  packages: string[];
  stats?: Record<string, any>;
}

function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TermuxMonitorPage() {
  const [devices, setDevices] = useState<TermuxDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/termux/devices");
      const data = await res.json();
      setDevices(data.devices || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDevices();
    const id = setInterval(fetchDevices, 10000);
    return () => clearInterval(id);
  }, [fetchDevices]);

  const online = devices.filter((d) => d.status === "online");
  const offline = devices.filter((d) => d.status !== "online");

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --red: #f87171;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 28px; }
        .eyebrow { color: var(--accent2); font-size: 12px; font-weight: 700; letter-spacing: 1px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .subtitle { color: var(--dim); font-size: 13px; margin-bottom: 24px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 26px; }
        .sumcard { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; }
        .sumcard .label { color: var(--dim); font-size: 11px; font-weight: 700; letter-spacing: .5px; }
        .sumcard .value { font-size: 24px; font-weight: 800; margin-top: 6px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; }
        .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .dot.online { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .dot.offline { background: var(--red); }
        .device-id { font-weight: 800; font-size: 14px; font-family: "Cascadia Code", "Fira Code", monospace; }
        .last-seen { color: var(--dim); font-size: 11px; margin-left: auto; }
        .info-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
        .info-item .ilabel { color: var(--dim); font-size: 10px; font-weight: 700; }
        .info-item .ival { font-size: 13px; font-weight: 700; }
        .pkg-list { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .pkg-tag { background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--accent); font-weight: 700; }
        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
        .nav-link { color: var(--accent2); text-decoration: none; font-size: 13px; font-weight: 700; background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 14px; }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">TERMUX CLIENT</div>
        <h1>Devices</h1>
      </div>
      <div className="subtitle">Monitor semua Termux / Cloud instance yang terhubung.</div>

      <div className="summary">
        <div className="sumcard">
          <div className="label">TOTAL DEVICES</div>
          <div className="value">{devices.length}</div>
        </div>
        <div className="sumcard">
          <div className="label">ONLINE</div>
          <div className="value" style={{ color: "var(--green)" }}>{online.length}</div>
        </div>
        <div className="sumcard">
          <div className="label">OFFLINE</div>
          <div className="value" style={{ color: "var(--red)" }}>{offline.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="empty">Memuat devices...</div>
      ) : devices.length === 0 ? (
        <div className="empty">
          Belum ada device terhubung.<br />
          <a href="/termux-packages" style={{ color: "var(--accent2)" }}>Generate command</a> untuk menambahkan device.
        </div>
      ) : (
        <div className="grid">
          {[...online, ...offline].map((d) => (
            <div key={d.deviceId} className="card">
              <div className="card-head">
                <span className={`dot ${d.status === "online" ? "online" : "offline"}`} />
                <span className="device-id">{d.deviceId.slice(0, 12)}...</span>
                <span className="last-seen">{fmtAgo(d.lastSeen)}</span>
              </div>
              <div className="info-row">
                <div className="info-item">
                  <div className="ilabel">HOSTNAME</div>
                  <div className="ival">{d.hostname}</div>
                </div>
                <div className="info-item">
                  <div className="ilabel">PLATFORM</div>
                  <div className="ival">{d.platform}</div>
                </div>
                <div className="info-item">
                  <div className="ilabel">REGISTERED</div>
                  <div className="ival">{fmtDate(d.registeredAt)}</div>
                </div>
              </div>
              {d.packages.length > 0 && (
                <div className="pkg-list">
                  {d.packages.map((p) => (
                    <span key={p} className="pkg-tag">{p}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
