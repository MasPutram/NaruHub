"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface TermuxPackage {
  pkg: string;
  label?: string;
  username?: string;
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

function fmtMB(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  return mb + " MB";
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function pctUsed(m?: { totalMB: number; usedMB: number }): number {
  if (!m || !m.totalMB) return 0;
  return Math.round((m.usedMB / m.totalMB) * 100);
}

function pctStorageUsed(m?: { totalMB: number; freeMB: number }): number {
  if (!m || !m.totalMB) return 0;
  return Math.round(((m.totalMB - m.freeMB) / m.totalMB) * 100);
}

function fillClass(v: number): string {
  return v >= 85 ? "danger" : v >= 70 ? "warn" : "";
}

export default function MonitorListPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<TermuxDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [toast, setToast] = useState("");

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function displayName(d: TermuxDevice) {
    return d.customName || d.hostname;
  }

  async function saveRename(deviceId: string) {
    const val = renameDraft.trim();
    setRenamingId(null);
    if (!val) return;
    try {
      await fetch("/api/device-control/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, name: val }),
      });
      setDevices((prev) => prev.map((d) => (d.deviceId === deviceId ? { ...d, customName: val } : d)));
      setToast("Rename saved");
    } catch {
      setToast("Gagal rename");
    }
  }

  const online = devices.filter((d) => d.status === "online");
  const offline = devices.filter((d) => d.status !== "online");
  const totalPackages = devices.reduce((a, d) => a + d.packages.length, 0);
  const visible = devices.filter((d) => filter === "all" || d.status === filter);

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --cyan: #22d3ee;
          --green: #34d399; --yellow: #fbbf24; --red: #f87171;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 28px 34px 50px; }
        button, input { font: inherit; }
        button { cursor: pointer; }

        .top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 25px; }
        .crumb { color: var(--dim); font-size: 12px; margin-bottom: 7px; }
        .crumb b { color: var(--ink); }
        h1 { margin: 0; font-size: 27px; }
        .sub { color: var(--dim); margin-top: 6px; }
        .live { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #2a5548; background: #10251f; color: var(--green); padding: 6px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 10px currentColor; }

        .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 13px; margin-bottom: 22px; }
        .stat { background: var(--card); border: 1px solid var(--border); border-top: 2px solid var(--accent); border-radius: 11px; padding: 16px; }
        .stat.cyan { border-top-color: var(--cyan); }
        .stat.green { border-top-color: var(--green); }
        .stat.yellow { border-top-color: var(--yellow); }
        .stat.red { border-top-color: var(--red); }
        .stat .label { color: var(--dim); font-size: 12px; }
        .stat .value { font-size: 21px; font-weight: 750; margin-top: 8px; }
        .stat small { color: var(--dim); font-size: 11px; }

        .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
        .search { flex: 1; min-width: 200px; position: relative; }
        .search input { width: 100%; background: var(--card); border: 1px solid var(--border); border-radius: 9px; padding: 11px 13px; color: var(--ink); outline: none; opacity: .45; }
        .search .lock { position: absolute; right: 12px; top: 12px; color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .5px; }
        .pills { display: flex; gap: 6px; }
        .pill { border: 1px solid var(--border); background: transparent; color: var(--dim); padding: 8px 11px; border-radius: 999px; font-size: 13px; }
        .pill.active { background: #211d32; color: var(--ink); border-color: #51466f; }
        .count { opacity: .6; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
        .device { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; transition: .15s; cursor: pointer; }
        .device:hover { border-color: #45455a; transform: translateY(-1px); }
        .devicehead { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
        .name { font-weight: 750; font-size: 16px; }
        .host { color: var(--dim); font-size: 11px; margin-top: 4px; }
        .status { font-size: 10px; text-transform: uppercase; font-weight: 750; display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
        .status.online { color: var(--green); }
        .status.offline { color: var(--red); }
        .edit { display: flex; gap: 6px; align-items: center; }
        .edit input { width: 150px; background: #0e0e16; color: var(--ink); border: 1px solid var(--accent); border-radius: 6px; padding: 5px 7px; }
        .rename { border: 0; background: none; color: var(--dim); padding: 2px; font-size: 12px; }
        .rename:hover { color: var(--ink); }

        .metric { margin-top: 15px; }
        .metricrow { display: flex; justify-content: space-between; color: var(--dim); font-size: 11px; margin-bottom: 6px; }
        .metricrow b { color: var(--ink); font-weight: 600; }
        .bar { height: 6px; background: #242431; border-radius: 99px; overflow: hidden; }
        .fill { height: 100%; border-radius: 99px; background: var(--green); }
        .fill.warn { background: var(--yellow); }
        .fill.danger { background: var(--red); }
        .devicefoot { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--dim); font-size: 11px; }
        .pkg { color: var(--cyan); }
        .openbtn { border: 1px solid var(--border); background: #181823; color: var(--ink); padding: 9px 13px; border-radius: 8px; width: 100%; margin-top: 12px; }
        .openbtn:hover { border-color: #44445a; }

        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
        .toast { position: fixed; right: 20px; bottom: 20px; background: #191923; border: 1px solid #39394d; padding: 11px 14px; border-radius: 8px; z-index: 20; box-shadow: 0 18px 50px #0007; font-size: 13px; }

        @media (max-width: 1000px) { .stats { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      <div className="top">
        <div>
          <div className="crumb">Monitor / <b>Devices</b></div>
          <h1>Device Monitor</h1>
          <div className="sub">Termux root devices &bull; polling every 10 seconds</div>
        </div>
        <span className="live"><span className="dot" /> LIVE</span>
      </div>

      <div className="stats">
        <div className="stat cyan">
          <div className="label">DEVICES</div>
          <div className="value">{devices.length}</div>
          <small>{online.length} online</small>
        </div>
        <div className="stat green">
          <div className="label">ONLINE</div>
          <div className="value">{online.length}</div>
          <small>current status</small>
        </div>
        <div className="stat red">
          <div className="label">OFFLINE</div>
          <div className="value">{offline.length}</div>
          <small>current status</small>
        </div>
        <div className="stat">
          <div className="label">ROBLOX PACKAGES</div>
          <div className="value">{totalPackages}</div>
          <small>detected</small>
        </div>
        <div className="stat yellow">
          <div className="label">POLLING</div>
          <div className="value">10s</div>
          <small>HTTP fetch</small>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <input disabled placeholder="Search devices (not available in backend)" />
          <span className="lock">LOCKED</span>
        </div>
        <div className="pills">
          {(["all", "online", "offline"] as const).map((x) => (
            <button key={x} className={`pill ${filter === x ? "active" : ""}`} onClick={() => setFilter(x)}>
              {x[0].toUpperCase() + x.slice(1)} <span className="count">{x === "all" ? devices.length : x === "online" ? online.length : offline.length}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty">Memuat devices...</div>
      ) : devices.length === 0 ? (
        <div className="empty">
          Belum ada device terhubung.<br />
          <a href="/termux-packages" style={{ color: "var(--cyan)" }}>Generate command</a> untuk menambahkan device.
        </div>
      ) : (
        <div className="grid">
          {visible.map((d) => {
            const ram = pctUsed(d.stats?.ram);
            const storage = pctStorageUsed(d.stats?.storage);
            const cpu = d.stats?.load ? Math.min(100, Math.round((d.stats.load["1m"] / 8) * 100)) : 0;
            const isRenaming = renamingId === d.deviceId;

            return (
              <div key={d.deviceId} className="device" onClick={() => !isRenaming && router.push(`/monitor/${d.deviceId}`)}>
                <div className="devicehead">
                  <div>
                    {isRenaming ? (
                      <div className="edit" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveRename(d.deviceId)}
                        />
                        <button className="rename" onClick={() => saveRename(d.deviceId)}>✓</button>
                      </div>
                    ) : (
                      <div className="edit">
                        <div className="name">{displayName(d)}</div>
                        <button
                          className="rename"
                          onClick={(e) => { e.stopPropagation(); setRenamingId(d.deviceId); setRenameDraft(displayName(d)); }}
                        >✎</button>
                      </div>
                    )}
                    <div className="host">{d.hostname} &bull; {d.platform}</div>
                  </div>
                  <div className={`status ${d.status === "online" ? "online" : "offline"}`}>
                    <span className="dot" />{d.status}
                  </div>
                </div>

                {d.stats?.ram && (
                  <div className="metric">
                    <div className="metricrow"><span>RAM</span><b>{fmtMB(d.stats.ram.usedMB)} / {fmtMB(d.stats.ram.totalMB)} &middot; {ram}%</b></div>
                    <div className="bar"><div className={`fill ${fillClass(ram)}`} style={{ width: `${ram}%` }} /></div>
                  </div>
                )}
                {d.stats?.load && (
                  <div className="metric">
                    <div className="metricrow"><span>CPU LOAD</span><b>{d.stats.load["1m"].toFixed(1)} &middot; 1m &middot; {cpu}%</b></div>
                    <div className="bar"><div className={`fill ${fillClass(cpu)}`} style={{ width: `${cpu}%` }} /></div>
                  </div>
                )}
                {d.stats?.storage && (
                  <div className="metric">
                    <div className="metricrow"><span>STORAGE</span><b>{fmtMB(d.stats.storage.freeMB)} free &middot; {storage}%</b></div>
                    <div className="bar"><div className={`fill ${fillClass(storage)}`} style={{ width: `${storage}%` }} /></div>
                  </div>
                )}

                <div className="devicefoot">
                  <span className="pkg">{d.packages.length} Roblox package{d.packages.length !== 1 ? "s" : ""}</span>
                  <span>Updated {ago(d.lastSeen)}</span>
                </div>
                <button className="openbtn" onClick={(e) => { e.stopPropagation(); router.push(`/monitor/${d.deviceId}`); }}>
                  Open device →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
