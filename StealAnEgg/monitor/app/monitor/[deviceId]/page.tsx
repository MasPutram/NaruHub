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

interface LogEntry {
  id: string;
  ts: number;
  action: string;
  packages: string[];
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

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = String(params?.deviceId || "");
  const [device, setDevice] = useState<TermuxDevice | null>(null);
  const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
  const [consoleLog, setConsoleLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<{ cols: number; rows: number }>({ cols: 5, rows: 2 });
  const [draftLayout, setDraftLayout] = useState<{ cols: number; rows: number }>({ cols: 5, rows: 2 });
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [launchingBatch, setLaunchingBatch] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const fetchDevice = useCallback(async () => {
    try {
      const [devRes, accRes, logRes] = await Promise.all([
        fetch("/api/termux/devices"),
        fetch("/api/accounts"),
        fetch(`/api/device-control/log?deviceId=${encodeURIComponent(deviceId)}`),
      ]);
      const devData = await devRes.json();
      const found = (devData.devices || []).find((d: TermuxDevice) => d.deviceId === deviceId);
      setDevice(found || null);

      const accData = await accRes.json();
      const byName: Record<string, AccountInfo> = {};
      for (const a of accData.accounts || []) byName[a.sourceAccount] = a;
      setAccounts(byName);

      const logData = await logRes.json();
      setConsoleLog(logData.entries || []);
    } catch {}
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
    const id = setInterval(fetchDevice, 10000);
    return () => clearInterval(id);
  }, [fetchDevice]);

  async function launchMany(pkgs: TermuxPackage[]) {
    if (pkgs.length === 0) return;
    setLaunchingBatch(true);
    setLaunchMsg("");
    try {
      const res = await fetch("/api/device-control/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          packageNames: pkgs.map((p) => p.pkg),
          cols: layout.cols,
          rows: layout.rows,
        }),
      });
      const data = await res.json();
      setLaunchMsg(data.ok ? `Dikirim ✓ (${pkgs.length} package)` : `Gagal: ${data.error}`);
      if (data.ok) fetchDevice(); // refresh console log right away
    } catch (e: any) {
      setLaunchMsg("Gagal: " + e.message);
    }
    setLaunchingBatch(false);
    setTimeout(() => setLaunchMsg(""), 4000);
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
      .modal-overlay {
        position: fixed; inset: 0; background: rgba(5,5,10,.7); backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
      }
      .modal-box {
        background: #0e0e18; border: 1px solid var(--card-border); border-radius: 18px;
        padding: 24px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto;
      }
      .modal-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
      .modal-title { font-size: 15px; font-weight: 800; letter-spacing: .5px; }
      .modal-subtitle { color: var(--dim); font-size: 12px; margin-top: 4px; }
      .modal-close {
        background: none; border: none; color: var(--dim); font-size: 16px; cursor: pointer;
        padding: 4px 8px; line-height: 1;
      }
      .modal-close:hover { color: var(--ink); }
      .modal-section-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
      .modal-section-label { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: 1px; }
      .modal-section-count { color: var(--accent2); font-size: 10px; font-weight: 700; letter-spacing: .5px; }
      .grid-preview {
        display: grid; gap: 8px; margin-bottom: 22px; background: #05050a;
        border: 1px solid var(--card-border); border-radius: 10px; padding: 8px;
      }
      .grid-cell {
        background: #141420; border: 1px solid var(--card-border); border-radius: 8px;
        display: flex; align-items: center; justify-content: center; text-align: center;
        font-size: 12px; font-weight: 700; color: var(--dim); padding: 6px; overflow: hidden; min-height: 68px;
      }
      .grid-cell.filled { border-color: var(--accent); color: var(--accent); background: rgba(167,139,250,.08); }
      .grid-cell .pname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
      .modal-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
      .modal-field { margin-bottom: 14px; }
      .modal-field label { display: block; color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: 1px; margin-bottom: 6px; }
      .modal-field select {
        width: 100%; background: #05050a; color: var(--ink); border: 1px solid var(--card-border);
        border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .modal-field select:disabled { opacity: .5; cursor: default; }
      .modal-apply-btn {
        width: 100%; background: var(--accent); color: #1a1030; border: none; border-radius: 10px;
        padding: 13px; font-size: 13px; font-weight: 800; cursor: pointer; margin-top: 4px;
      }
      .modal-apply-btn:hover { filter: brightness(1.1); }

      .console-wrap {
        background: #05050a; border: 1px solid var(--card-border); border-radius: 14px;
        padding: 14px 16px; margin-bottom: 16px;
      }
      .console-title { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; }
      .console-body { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
      .console-line {
        font-family: "Cascadia Code", "Fira Code", monospace; font-size: 12px; line-height: 1.6;
        display: flex; gap: 8px;
      }
      .console-ts { color: var(--green); flex-shrink: 0; }
      .console-text { color: var(--dim); }
      .console-pkgs { color: var(--accent2); }
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
        <button
          className="btn ghost"
          onClick={() => { setDraftLayout(layout); setGridModalOpen(true); }}
        >
          ⊞ Configure Grid Layout
        </button>
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          {layout.rows} rows × {layout.cols} cols ({layout.cols * layout.rows} slot)
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {launchMsg && <span className="launch-msg">{launchMsg}</span>}
          <button
            className="btn"
            onClick={() => launchMany(selectedPkgs)}
            disabled={selectedPkgs.length === 0 || device.status !== "online" || launchingBatch}
          >
            {launchingBatch ? "Mengirim..." : `Buka Terpilih (${selectedPkgs.length})`}
          </button>
          <button className="btn ghost" onClick={() => launchMany(pkgs)} disabled={pkgs.length === 0 || device.status !== "online" || launchingBatch}>
            Buka Semua ({pkgs.length})
          </button>
        </div>
      </div>

      {consoleLog.length > 0 && (
        <div className="console-wrap">
          <div className="console-title">COMMAND CONSOLE</div>
          <div className="console-body">
            {consoleLog.map((entry) => (
              <div key={entry.id} className="console-line">
                <span className="console-ts">{fmtClock(entry.ts)}</span>
                <span className="console-text">
                  Send Open Selected Packages to: <span className="console-pkgs">{entry.packages.join(", ")}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gridModalOpen && (
        <div className="modal-overlay" onClick={() => setGridModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">⊞ GRID LAYOUT CONFIGURATION</div>
                <div className="modal-subtitle">Device: {displayName}</div>
              </div>
              <button className="modal-close" onClick={() => setGridModalOpen(false)}>✕</button>
            </div>

            <div className="modal-section-row">
              <span className="modal-section-label">LAYOUT PREVIEW</span>
              <span className="modal-section-count">
                {draftLayout.rows} ROWS × {draftLayout.cols} COLUMNS ({draftLayout.rows * draftLayout.cols} SLOTS)
              </span>
            </div>
            <div
              className="grid-preview"
              style={{
                gridTemplateColumns: `repeat(${draftLayout.cols}, 1fr)`,
                gridTemplateRows: `repeat(${draftLayout.rows}, 1fr)`,
              }}
            >
              {Array.from({ length: draftLayout.cols * draftLayout.rows }).map((_, slot) => {
                const p = selectedPkgs[slot];
                return (
                  <div key={slot} className={`grid-cell ${p ? "filled" : ""}`}>
                    {p ? <span className="pname">{p.username || p.label || p.pkg}</span> : `#${slot + 1}`}
                  </div>
                );
              })}
            </div>

            <div className="modal-field-row">
              <div className="modal-field">
                <label>ROWS</label>
                <select
                  value={draftLayout.rows}
                  onChange={(e) => setDraftLayout((l) => ({ ...l, rows: Number(e.target.value) }))}
                >
                  {Array.from({ length: 10 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} Row{i + 1 > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>COLUMNS</label>
                <select
                  value={draftLayout.cols}
                  onChange={(e) => setDraftLayout((l) => ({ ...l, cols: Number(e.target.value) }))}
                >
                  {Array.from({ length: 10 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} Column{i + 1 > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-field">
              <label>SIZE MODE</label>
              <select disabled defaultValue="full">
                <option value="full">Full Screen (Fills device screen)</option>
              </select>
            </div>

            <button className="modal-apply-btn" onClick={() => { setLayout(draftLayout); setGridModalOpen(false); }}>
              ✓ Apply Grid Layout
            </button>
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
              {pkgs.map((p) => {
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
                        <button
                          className="icon-btn"
                          disabled={launchingBatch || device.status !== "online"}
                          onClick={() => launchMany([p])}
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
