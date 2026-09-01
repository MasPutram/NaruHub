"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface TermuxPackage {
  pkg: string;
  label?: string;
  username?: string;
}

interface AccountInfo {
  sourceAccount: string;
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
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

function fmtSession(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = String(params?.deviceId || "");
  const [device, setDevice] = useState<TermuxDevice | null>(null);
  const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<{ cols: number; rows: number }>({ cols: 5, rows: 2 });
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchMsg, setLaunchMsg] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const fetchDevice = useCallback(async () => {
    try {
      const [devRes, accRes] = await Promise.all([
        fetch("/api/termux/devices"),
        fetch("/api/accounts"),
      ]);
      const devData = await devRes.json();
      const found = (devData.devices || []).find((d: TermuxDevice) => d.deviceId === deviceId);
      setDevice(found || null);

      const accData = await accRes.json();
      const byName: Record<string, AccountInfo> = {};
      for (const a of accData.accounts || []) byName[a.sourceAccount] = a;
      setAccounts(byName);
    } catch {}
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
    const id = setInterval(fetchDevice, 10000);
    return () => clearInterval(id);
  }, [fetchDevice]);

  async function launchPackage(packageName: string, index: number) {
    const key = packageName;
    setLaunching(key);
    setLaunchMsg((m) => ({ ...m, [key]: "" }));
    try {
      const res = await fetch("/api/device-control/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, packageName, cols: layout.cols, rows: layout.rows, index }),
      });
      const data = await res.json();
      setLaunchMsg((m) => ({ ...m, [key]: data.ok ? "Dikirim ✓" : `Gagal: ${data.error}` }));
    } catch (e: any) {
      setLaunchMsg((m) => ({ ...m, [key]: "Gagal: " + e.message }));
    }
    setLaunching(null);
    setTimeout(() => setLaunchMsg((m) => ({ ...m, [key]: "" })), 4000);
  }

  async function launchMany(pkgs: TermuxPackage[]) {
    // Fire in sequence so the device doesn't see them all at once and
    // race with itself -- spaces launches out a bit at the source too.
    for (let i = 0; i < pkgs.length; i++) {
      await launchPackage(pkgs[i].pkg, i);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const pkgs = (device?.packages || []).map(normalizePackage);
  const selectedPkgs = pkgs.filter((p) => selected[p.pkg] !== false);

  // Default every package to selected the first time it's seen.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of pkgs) {
        if (!(p.pkg in next)) {
          next[p.pkg] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.packages]);

  function toggleAll(value: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const p of pkgs) next[p.pkg] = value;
      return next;
    });
  }

  const styles = (
    <style>{`
      :root {
        --bg: #0b0b12; --card: #14141f; --card-border: #262636;
        --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
        --green: #34d399; --red: #f87171;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 28px; }
      .back-link { color: var(--accent2); font-size: 12px; font-weight: 700; text-decoration: none; letter-spacing: 1px; }
      .header { display: flex; align-items: center; gap: 12px; margin: 6px 0 20px; }
      .header .dot { width: 10px; height: 10px; border-radius: 50%; }
      .header .dot.online { background: var(--green); box-shadow: 0 0 8px var(--green); }
      .header .dot.offline { background: var(--red); }
      h1 { font-size: 22px; margin: 0; }
      .header-meta { color: var(--dim); font-size: 12px; margin-left: auto; }

      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .stat-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px 14px; }
      .stat-label { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .5px; margin-bottom: 4px; }
      .stat-value { font-size: 18px; font-weight: 800; }

      .controls-bar {
        background: var(--card); border: 1px solid var(--card-border); border-radius: 12px;
        padding: 12px 16px; display: flex; align-items: center; gap: 14px; margin-bottom: 16px; flex-wrap: wrap;
      }
      .controls-bar label { color: var(--dim); font-size: 11px; font-weight: 700; }
      .controls-bar input {
        width: 50px; background: var(--bg); color: var(--ink); border: 1px solid var(--card-border);
        border-radius: 6px; padding: 4px 8px; font-size: 13px; text-align: center;
      }
      .btn {
        background: var(--accent); color: #1a1030; border: none; border-radius: 8px;
        padding: 7px 16px; font-size: 12px; font-weight: 800; cursor: pointer;
      }
      .btn:hover { filter: brightness(1.1); }
      .btn:disabled { opacity: .5; cursor: default; }
      .btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }

      .table-wrap { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: 1px; padding: 12px 16px; border-bottom: 1px solid var(--card-border); }
      td { padding: 14px 16px; border-bottom: 1px solid var(--card-border); font-size: 13px; }
      tr:last-child td { border-bottom: none; }
      .pkg-name { font-weight: 700; color: var(--ink); }
      .pkg-label { color: var(--accent); font-size: 11px; font-weight: 700; margin-top: 2px; }
      .account-name { font-weight: 700; }
      .account-none { color: var(--dim); font-style: italic; font-size: 12px; }
      .status-badge {
        display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px;
        font-size: 10px; font-weight: 800; letter-spacing: .5px;
      }
      .status-badge.online { background: rgba(52,211,153,.15); color: var(--green); }
      .status-badge.offline { background: rgba(139,139,163,.15); color: var(--dim); }
      .status-badge .sdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .session-val { color: var(--dim); font-size: 12px; }
      .actions { display: flex; gap: 6px; justify-content: flex-end; }
      .icon-btn {
        width: 28px; height: 28px; background: var(--bg); border: 1px solid var(--card-border);
        border-radius: 6px; cursor: pointer; color: var(--ink); font-size: 12px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .icon-btn:hover { border-color: var(--accent); color: var(--accent); }
      .icon-btn:disabled { opacity: .4; cursor: default; }
      .launch-msg { color: var(--dim); font-size: 11px; margin-left: 8px; }
      .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
      .not-found { color: var(--dim); padding: 40px 0; text-align: center; font-size: 14px; }

      .layout-warning {
        background: rgba(250, 204, 21, .08); border: 1px solid rgba(250, 204, 21, .3); border-radius: 12px;
        padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #facc15; line-height: 1.5;
      }
      .preview-wrap {
        background: var(--card); border: 1px solid var(--card-border); border-radius: 14px;
        padding: 16px; margin-bottom: 16px;
      }
      .preview-title { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: 1px; margin-bottom: 10px; }
      .preview-screen {
        background: #05050a; border: 1px solid var(--card-border); border-radius: 8px;
        display: grid; gap: 3px; padding: 3px; margin: 0 auto;
      }
      .preview-cell {
        background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 4px;
        display: flex; align-items: center; justify-content: center; text-align: center;
        font-size: 10px; color: var(--dim); padding: 4px; overflow: hidden; min-height: 36px;
      }
      .preview-cell.filled { background: var(--accent); color: #1a1030; font-weight: 700; border-color: var(--accent); }
      .preview-cell .pname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
    `}</style>
  );

  if (loading) {
    return (
      <>
        {styles}
        <a href="/monitor" className="back-link">← MONITOR</a>
        <div className="empty">Memuat device...</div>
      </>
    );
  }

  if (!device) {
    return (
      <>
        {styles}
        <a href="/monitor" className="back-link">← MONITOR</a>
        <div className="not-found">Device tidak ditemukan atau sudah offline lama.</div>
      </>
    );
  }

  const displayName = device.customName || device.hostname;

  return (
    <>
      {styles}
      <a href="/monitor" className="back-link">← MONITOR</a>
      <div className="header">
        <span className={`dot ${device.status === "online" ? "online" : "offline"}`} />
        <h1>{displayName}</h1>
        <span className="header-meta">{fmtAgo(device.lastSeen)} · {device.deviceId.slice(0, 12)}...</span>
      </div>

      <div className="stats-grid">
        {device.stats?.battery && device.stats.battery.percent != null && (
          <div className="stat-card">
            <div className="stat-label">BATTERY</div>
            <div className="stat-value">{device.stats.battery.percent}%{device.stats.battery.charging ? " ⚡" : ""}</div>
          </div>
        )}
        {device.stats?.ram && (
          <div className="stat-card">
            <div className="stat-label">RAM</div>
            <div className="stat-value">{fmtGB(device.stats.ram.usedMB)} / {fmtGB(device.stats.ram.totalMB)}</div>
          </div>
        )}
        {device.stats?.storage && (
          <div className="stat-card">
            <div className="stat-label">STORAGE FREE</div>
            <div className="stat-value">{fmtGB(device.stats.storage.freeMB)}</div>
          </div>
        )}
        {device.stats?.load && (
          <div className="stat-card">
            <div className="stat-label">CPU LOAD (1m)</div>
            <div className="stat-value">{device.stats.load["1m"].toFixed(2)}</div>
          </div>
        )}
        {device.screen && (
          <div className="stat-card">
            <div className="stat-label">SCREEN</div>
            <div className="stat-value">{device.screen.width}x{device.screen.height}</div>
          </div>
        )}
      </div>

      <div className="layout-warning">
        ⚠ Auto-resize window sementara dimatikan -- di device asli itu bikin restart. Tombol "Buka" cuma
        buka package biasa (fullscreen), belum otomatis nge-posisiin ke slot grid. Preview di bawah cuma
        gambaran, belum ke-apply ke device.
      </div>

      <div className="controls-bar">
        <label>LAYOUT</label>
        <input type="number" min={1} max={10} value={layout.cols}
          onChange={(e) => setLayout((l) => ({ ...l, cols: Math.max(1, Number(e.target.value) || 1) }))}
        />
        <span style={{ color: "var(--dim)" }}>x</span>
        <input type="number" min={1} max={10} value={layout.rows}
          onChange={(e) => setLayout((l) => ({ ...l, rows: Math.max(1, Number(e.target.value) || 1) }))}
        />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>({layout.cols * layout.rows} slot)</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => launchMany(selectedPkgs)}
            disabled={selectedPkgs.length === 0 || device.status !== "online"}
          >
            Buka Terpilih ({selectedPkgs.length})
          </button>
          <button className="btn ghost" onClick={() => launchMany(pkgs)} disabled={pkgs.length === 0 || device.status !== "online"}>
            Buka Semua ({pkgs.length})
          </button>
        </div>
      </div>

      {pkgs.length > 0 && (
        <div className="preview-wrap">
          <div className="preview-title">PREVIEW LAYOUT ({layout.cols}x{layout.rows}){device.screen ? ` -- layar ${device.screen.width}x${device.screen.height}` : ""}</div>
          <div
            className="preview-screen"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
              width: "100%",
              maxWidth: 420,
              aspectRatio: device.screen ? `${device.screen.width} / ${device.screen.height}` : "9 / 16",
            }}
          >
            {Array.from({ length: layout.cols * layout.rows }).map((_, slot) => {
              const p = selectedPkgs[slot];
              return (
                <div key={slot} className={`preview-cell ${p ? "filled" : ""}`}>
                  {p ? <span className="pname">{p.username || p.label || p.pkg}</span> : slot + 1}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="table-wrap">
        {pkgs.length === 0 ? (
          <div className="empty">Belum ada package terdeteksi di device ini.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selectedPkgs.length === pkgs.length && pkgs.length > 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th>PACKAGE</th>
                <th>ACCOUNT</th>
                <th>SESSION</th>
                <th>STATUS</th>
                <th style={{ textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {pkgs.map((p, i) => {
                const acc = p.username ? accounts[p.username] : undefined;
                const sessionSecs = acc?.online && acc.firstSeen ? Math.max(0, Date.now() / 1000 - acc.firstSeen) : null;
                return (
                  <tr key={p.pkg}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected[p.pkg] !== false}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [p.pkg]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <div className="pkg-name">{p.pkg}</div>
                      {p.label && p.label !== p.pkg && <div className="pkg-label">{p.label}</div>}
                    </td>
                    <td>
                      {p.username ? (
                        <div className="account-name">{p.username}</div>
                      ) : (
                        <div className="account-none">belum terdeteksi</div>
                      )}
                    </td>
                    <td>
                      {sessionSecs != null ? (
                        <span className="session-val">{fmtSession(sessionSecs)}</span>
                      ) : (
                        <span className="session-val">—</span>
                      )}
                    </td>
                    <td>
                      {p.username ? (
                        <span className={`status-badge ${acc?.online ? "online" : "offline"}`}>
                          <span className="sdot" />
                          {acc?.online ? "IN GAME" : "DISCONNECTED"}
                        </span>
                      ) : (
                        <span className="status-badge offline"><span className="sdot" />UNKNOWN</span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {launchMsg[p.pkg] && <span className="launch-msg">{launchMsg[p.pkg]}</span>}
                        <button
                          className="icon-btn"
                          disabled={launching === p.pkg || device.status !== "online"}
                          onClick={() => launchPackage(p.pkg, i)}
                          title="Buka"
                        >▶</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
