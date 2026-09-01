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
  const router = useRouter();
  const [devices, setDevices] = useState<TermuxDevice[]>([]);
  const [loading, setLoading] = useState(true);
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
        .card {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px;
          cursor: pointer; transition: border-color .15s, transform .1s;
        }
        .card:hover { border-color: var(--accent); }
        .card:active { transform: scale(0.99); }
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
        .chevron { color: var(--dim); font-size: 14px; flex-shrink: 0; }
        .device-id-sub { color: var(--dim); font-size: 10px; font-family: "Cascadia Code", "Fira Code", monospace; margin-bottom: 10px; }
        .pkg-count { color: var(--dim); font-size: 11px; margin-top: 10px; }

        .pbar-wrap { margin-bottom: 8px; }
        .pbar-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .pbar-label { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .3px; }
        .pbar-sublabel { color: var(--dim); font-size: 10px; }
        .pbar-track { height: 6px; background: var(--bg); border-radius: 4px; overflow: hidden; }
        .pbar-fill { height: 100%; border-radius: 4px; transition: width .3s; }

        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">TERMUX CLIENT</div>
        <h1>Monitor</h1>
      </div>
      <div className="subtitle">Monitor semua Termux / Cloud instance yang terhubung. Klik card untuk lihat detail.</div>

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
            const displayName = nameEdits[d.deviceId] ?? d.customName ?? d.hostname;
            const ramPct = d.stats?.ram ? (d.stats.ram.usedMB / Math.max(1, d.stats.ram.totalMB)) * 100 : null;
            const storagePct = d.stats?.storage
              ? ((d.stats.storage.totalMB - d.stats.storage.freeMB) / Math.max(1, d.stats.storage.totalMB)) * 100
              : null;
            const cpuPct = d.stats?.load ? Math.min(100, d.stats.load["1m"] * 100) : null;

            return (
              <div key={d.deviceId} className="card" onClick={() => router.push(`/monitor/${d.deviceId}`)}>
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
                  <span className="chevron">›</span>
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

                <div className="pkg-count">{d.packages.length} package terdeteksi</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
