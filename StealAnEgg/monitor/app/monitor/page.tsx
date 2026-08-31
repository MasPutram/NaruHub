"use client";

import { useEffect, useState, useCallback } from "react";

interface TermuxPackage {
  pkg: string;
  label?: string;
}

interface TermuxStats {
  battery?: { percent: number | null; charging: boolean };
  ram?: { totalMB: number; usedMB: number };
  storage?: { totalMB: number; freeMB: number };
  load?: { "1m": number; "5m": number; "15m": number };
}

interface TermuxDevice {
  deviceId: string;
  hostname: string;
  customName?: string;
  platform: string;
  status: string;
  registeredAt: number;
  lastSeen: number;
  packages: (string | TermuxPackage)[];
  screen?: { width: number; height: number };
  stats?: TermuxStats;
}

function normalizePackage(p: string | TermuxPackage): TermuxPackage {
  return typeof p === "string" ? { pkg: p } : p;
}

function fmtGB(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  return mb + " MB";
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

/** green under 60%, yellow 60-85%, red above 85% -- getting fuller = more urgent. */
function barColor(pct: number): string {
  if (pct >= 85) return "#f87171";
  if (pct >= 60) return "#facc15";
  return "#34d399";
}

function ProgressBar({ label, pct, sublabel }: { label: string; pct: number; sublabel: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="pbar-wrap">
      <div className="pbar-top">
        <span className="pbar-label">{label}</span>
        <span className="pbar-sublabel">{sublabel}</span>
      </div>
      <div className="pbar-track">
        <div className="pbar-fill" style={{ width: `${clamped}%`, background: barColor(clamped) }} />
      </div>
    </div>
  );
}

export default function MonitorPage() {
  const [devices, setDevices] = useState<TermuxDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<Record<string, { cols: number; rows: number }>>({});
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchMsg, setLaunchMsg] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nameEdits, setNameEdits] = useState<Record<string, string>>({});
  const [nameSaving, setNameSaving] = useState<string | null>(null);

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

  function getLayout(deviceId: string, pkgCount: number) {
    return layout[deviceId] || { cols: Math.min(5, pkgCount) || 1, rows: Math.max(1, Math.ceil(pkgCount / 5)) };
  }

  function setLayoutFor(deviceId: string, patch: Partial<{ cols: number; rows: number }>) {
    setLayout((prev) => ({
      ...prev,
      [deviceId]: { ...getLayout(deviceId, 1), ...prev[deviceId], ...patch },
    }));
  }

  async function launchPackage(deviceId: string, packageName: string, index: number, pkgCount: number) {
    const { cols, rows } = getLayout(deviceId, pkgCount);
    const key = `${deviceId}:${packageName}`;
    setLaunching(key);
    setLaunchMsg((m) => ({ ...m, [key]: "" }));
    try {
      const res = await fetch("/api/device-control/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, packageName, cols, rows, index }),
      });
      const data = await res.json();
      setLaunchMsg((m) => ({ ...m, [key]: data.ok ? "Dikirim ✓" : `Gagal: ${data.error}` }));
    } catch (e: any) {
      setLaunchMsg((m) => ({ ...m, [key]: "Gagal: " + e.message }));
    }
    setLaunching(null);
    setTimeout(() => setLaunchMsg((m) => ({ ...m, [key]: "" })), 4000);
  }

  async function saveName(deviceId: string, name: string) {
    setNameSaving(deviceId);
    try {
      await fetch("/api/device-control/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, name }),
      });
      setDevices((prev) => prev.map((d) => (d.deviceId === deviceId ? { ...d, customName: name } : d)));
    } catch {}
    setNameSaving(null);
  }

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
        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .dot.online { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .dot.offline { background: var(--red); }
        .name-input {
          flex: 1; min-width: 0; background: transparent; color: var(--ink); border: none;
          font-weight: 800; font-size: 14px; padding: 3px 4px; border-radius: 4px;
        }
        .name-input:hover, .name-input:focus { background: var(--bg); outline: none; }
        .name-input:focus { border: 1px solid var(--accent); }
        .last-seen { color: var(--dim); font-size: 11px; white-space: nowrap; }
        .expand-btn {
          background: none; border: none; color: var(--dim); cursor: pointer; font-size: 16px;
          padding: 2px 6px; flex-shrink: 0; transform: rotate(0deg); transition: transform .15s;
        }
        .expand-btn.open { transform: rotate(90deg); }
        .device-id-sub { color: var(--dim); font-size: 10px; font-family: "Cascadia Code", "Fira Code", monospace; margin-bottom: 10px; }

        .pbar-wrap { margin-bottom: 8px; }
        .pbar-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .pbar-label { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .3px; }
        .pbar-sublabel { color: var(--dim); font-size: 10px; }
        .pbar-track { height: 6px; background: var(--bg); border-radius: 4px; overflow: hidden; }
        .pbar-fill { height: 100%; border-radius: 4px; transition: width .3s; }

        .expand-body { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--card-border); }
        .info-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
        .info-item .ilabel { color: var(--dim); font-size: 10px; font-weight: 700; }
        .info-item .ival { font-size: 13px; font-weight: 700; }
        .layout-row { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
        .layout-row input {
          width: 44px; background: var(--bg); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 6px; padding: 3px 6px; font-size: 12px; text-align: center;
        }
        .layout-x { color: var(--dim); font-size: 12px; }
        .pkg-list-full { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .pkg-row { display: flex; align-items: center; gap: 8px; }
        .pkg-tag { background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--accent); font-weight: 700; flex: 1; }
        .launch-btn {
          background: var(--accent); color: #1a1030; border: none; border-radius: 6px;
          padding: 4px 12px; font-size: 11px; font-weight: 800; cursor: pointer;
        }
        .launch-btn:disabled { opacity: .5; cursor: default; }
        .launch-msg { color: var(--dim); font-size: 11px; white-space: nowrap; }
        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">TERMUX CLIENT</div>
        <h1>Monitor</h1>
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
          {[...online, ...offline].map((d) => {
            const isOpen = !!expanded[d.deviceId];
            const displayName = nameEdits[d.deviceId] ?? d.customName ?? d.hostname;
            const ramPct = d.stats?.ram ? (d.stats.ram.usedMB / Math.max(1, d.stats.ram.totalMB)) * 100 : null;
            const storagePct = d.stats?.storage
              ? ((d.stats.storage.totalMB - d.stats.storage.freeMB) / Math.max(1, d.stats.storage.totalMB)) * 100
              : null;
            const cpuPct = d.stats?.load ? Math.min(100, d.stats.load["1m"] * 100) : null;
            const pkgs = d.packages.map(normalizePackage);
            const { cols, rows } = getLayout(d.deviceId, pkgs.length);

            return (
              <div key={d.deviceId} className="card">
                <div className="card-head">
                  <span className={`dot ${d.status === "online" ? "online" : "offline"}`} />
                  <input
                    className="name-input"
                    value={displayName}
                    onChange={(e) => setNameEdits((prev) => ({ ...prev, [d.deviceId]: e.target.value }))}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val && val !== (d.customName ?? d.hostname)) saveName(d.deviceId, val);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    disabled={nameSaving === d.deviceId}
                  />
                  <span className="last-seen">{fmtAgo(d.lastSeen)}</span>
                  <button
                    className={`expand-btn ${isOpen ? "open" : ""}`}
                    onClick={() => setExpanded((prev) => ({ ...prev, [d.deviceId]: !prev[d.deviceId] }))}
                    aria-label="Toggle details"
                  >
                    ▶
                  </button>
                </div>
                <div className="device-id-sub">{d.deviceId.slice(0, 16)}...</div>

                {ramPct != null && (
                  <ProgressBar label="RAM" pct={ramPct} sublabel={`${fmtGB(d.stats!.ram!.usedMB)} / ${fmtGB(d.stats!.ram!.totalMB)}`} />
                )}
                {cpuPct != null && (
                  <ProgressBar label="CPU LOAD" pct={cpuPct} sublabel={d.stats!.load!["1m"].toFixed(2)} />
                )}
                {storagePct != null && (
                  <ProgressBar label="STORAGE" pct={storagePct} sublabel={`${fmtGB(d.stats!.storage!.freeMB)} free`} />
                )}

                {isOpen && (
                  <div className="expand-body">
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
                    {d.screen && (
                      <div className="info-row">
                        <div className="info-item">
                          <div className="ilabel">SCREEN</div>
                          <div className="ival">{d.screen.width}x{d.screen.height}</div>
                        </div>
                        {d.stats?.battery && d.stats.battery.percent != null && (
                          <div className="info-item">
                            <div className="ilabel">BATTERY</div>
                            <div className="ival">
                              {d.stats.battery.percent}%{d.stats.battery.charging ? " ⚡" : ""}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {pkgs.length > 0 && (
                      <>
                        <div className="layout-row">
                          <span className="ilabel">LAYOUT</span>
                          <input
                            type="number" min={1} max={10} value={cols}
                            onChange={(e) => setLayoutFor(d.deviceId, { cols: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <span className="layout-x">x</span>
                          <input
                            type="number" min={1} max={10} value={rows}
                            onChange={(e) => setLayoutFor(d.deviceId, { rows: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <span className="ilabel">({cols * rows} slot)</span>
                        </div>
                        <div className="pkg-list-full">
                          {pkgs.map((p, i) => {
                            const key = `${d.deviceId}:${p.pkg}`;
                            return (
                              <div key={p.pkg} className="pkg-row">
                                <span className="pkg-tag">{p.label || p.pkg}</span>
                                <button
                                  className="launch-btn"
                                  disabled={launching === key || d.status !== "online"}
                                  onClick={() => launchPackage(d.deviceId, p.pkg, i, pkgs.length)}
                                >
                                  {launching === key ? "..." : "Buka"}
                                </button>
                                {launchMsg[key] && <span className="launch-msg">{launchMsg[key]}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
