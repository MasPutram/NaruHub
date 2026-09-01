"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

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

function fmtSession(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pctUsed(m?: { totalMB: number; usedMB: number }): number {
  if (!m || !m.totalMB) return 0;
  return Math.round((m.usedMB / m.totalMB) * 100);
}

function pctStorageUsed(m?: { totalMB: number; freeMB: number }): number {
  if (!m || !m.totalMB) return 0;
  return Math.round(((m.totalMB - m.freeMB) / m.totalMB) * 100);
}

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = String(params?.deviceId || "");

  const [device, setDevice] = useState<TermuxDevice | null>(null);
  const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
  const [consoleLog, setConsoleLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<{ cols: number; rows: number }>({ cols: 4, rows: 3 });
  const [draftLayout, setDraftLayout] = useState<{ cols: number; rows: number }>({ cols: 4, rows: 3 });
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [launchingBatch, setLaunchingBatch] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [toast, setToast] = useState("");

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
      setConsoleLog((logData.entries || []).slice().reverse()); // oldest first, like a real console
    } catch {}
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
    const id = setInterval(fetchDevice, 10000);
    return () => clearInterval(id);
  }, [fetchDevice]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const pkgs = (device?.packages || []).map(normalizePackage);
  const selectedPkgs = pkgs.filter((p) => selected[p.pkg] !== false);

  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of pkgs) {
        if (!(p.pkg in next)) { next[p.pkg] = true; changed = true; }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.packages]);

  function displayName(d: TermuxDevice) {
    return d.customName || d.hostname;
  }

  async function saveRename() {
    if (!device) return;
    const val = renameDraft.trim();
    setRenaming(false);
    if (!val) return;
    try {
      await fetch("/api/device-control/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, name: val }),
      });
      setDevice((d) => (d ? { ...d, customName: val } : d));
      setToast("Rename saved (POST /api/device-control/rename)");
    } catch {
      setToast("Gagal rename");
    }
  }

  async function launchMany(list: TermuxPackage[], resize = false, gridOverride?: { cols: number; rows: number }) {
    if (list.length === 0) return;
    setLaunchingBatch(true);
    try {
      const g = gridOverride || layout;
      const res = await fetch("/api/device-control/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, packageNames: list.map((p) => p.pkg), cols: g.cols, rows: g.rows, resize }),
      });
      const data = await res.json();
      setToast(
        data.ok
          ? resize
            ? `Grid applied: resize queued for ${list.length} package${list.length !== 1 ? "s" : ""}`
            : `Launch queued for ${list.length} package${list.length !== 1 ? "s" : ""}`
          : `Gagal: ${data.error}`
      );
      if (data.ok) fetchDevice();
    } catch (e: any) {
      setToast("Gagal: " + e.message);
    }
    setLaunchingBatch(false);
  }

  // Auto-fit: given N packages, pick a near-square cols x rows (favors more
  // columns than rows since phone/cloud-phone screens are usually taller
  // than wide, so a wider grid keeps each cell less letterboxed).
  function autoGridDims(n: number): { cols: number; rows: number } {
    if (n <= 0) return { cols: 1, rows: 1 };
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    return { cols, rows };
  }

  function autoGridAndApply() {
    if (selectedPkgs.length === 0) {
      setToast("Pilih dulu package yang mau di-grid (checkbox di tabel)");
      return;
    }
    const dims = autoGridDims(selectedPkgs.length);
    const ok = window.confirm(
      `Auto grid ${dims.cols}x${dims.rows} untuk ${selectedPkgs.length} package yang dipilih.\n\n` +
        `Langsung launch + resize di device SUNGGUHAN. Lanjut?`
    );
    if (!ok) return;
    setLayout(dims);
    setDraftLayout(dims);
    launchMany(selectedPkgs, true, dims);
  }

  function applyGridToDevice() {
    if (selectedPkgs.length === 0) {
      setToast("Pilih dulu package yang mau di-grid (checkbox di tabel)");
      return;
    }
    const ok = window.confirm(
      `Terapkan grid ${draftLayout.cols}x${draftLayout.rows} ke device ini sekarang?\n\n` +
        `${selectedPkgs.length} package akan di-launch + resize di device SUNGGUHAN. ` +
        `Uji dulu di 1 device sebelum dipakai luas.`
    );
    if (!ok) return;
    setLayout(draftLayout);
    setGridModalOpen(false);
    launchMany(selectedPkgs, true, draftLayout);
  }

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
        --bg: #0b0b12; --card: #14141f; --border: #262636;
        --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --cyan: #22d3ee;
        --green: #34d399; --yellow: #fbbf24; --red: #f87171;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 28px 34px 50px; }
      button, input, select { font: inherit; }
      button { cursor: pointer; }

      .back { border: 0; background: none; color: var(--dim); padding: 0; margin-bottom: 14px; font-size: 13px; }
      .back:hover { color: var(--ink); }
      .top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 25px; flex-wrap: wrap; }
      .crumb { color: var(--dim); font-size: 12px; margin-bottom: 7px; }
      .crumb b { color: var(--ink); }
      h1 { margin: 0; font-size: 27px; display: flex; align-items: center; gap: 8px; }
      .sub { color: var(--dim); margin-top: 6px; font-size: 13px; }
      .edit { display: flex; gap: 6px; align-items: center; }
      .edit input { width: 220px; background: #0e0e16; color: var(--ink); border: 1px solid var(--accent); border-radius: 6px; padding: 5px 8px; font-size: 20px; }
      .rename-btn { border: 0; background: none; color: var(--dim); font-size: 15px; padding: 2px; }
      .rename-btn:hover { color: var(--ink); }

      .live { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #2a5548; background: #10251f; color: var(--green); padding: 6px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .live.offline { border-color: #4a2a2a; background: #251010; color: var(--red); }
      .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 10px currentColor; }
      .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .btn { border: 1px solid var(--border); background: #181823; color: var(--ink); padding: 9px 13px; border-radius: 8px; font-size: 12px; font-weight: 600; }
      .btn:hover { border-color: #44445a; }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: #100d19; font-weight: 700; }
      .btn:disabled { opacity: .35; cursor: not-allowed; }

      .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 13px; margin-bottom: 22px; }
      .stat { background: var(--card); border: 1px solid var(--border); border-top: 2px solid var(--accent); border-radius: 11px; padding: 16px; }
      .stat.cyan { border-top-color: var(--cyan); }
      .stat.green { border-top-color: var(--green); }
      .stat.yellow { border-top-color: var(--yellow); }
      .stat.red { border-top-color: var(--red); }
      .stat .label { color: var(--dim); font-size: 12px; }
      .stat .value { font-size: 21px; font-weight: 750; margin-top: 8px; }
      .stat small { color: var(--dim); font-size: 11px; }

      .two { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; }
      .panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 17px; }
      .panelhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 13px; }
      .panel h3 { margin: 0; font-size: 14px; }
      .muted { color: var(--dim); font-size: 12px; }
      .table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .table th { color: var(--dim); font-size: 10px; text-transform: uppercase; text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
      .table td { padding: 11px 8px; border-bottom: 1px solid #20202d; }
      .table tr:last-child td { border-bottom: 0; }
      .badge { padding: 4px 7px; border-radius: 6px; font-size: 10px; font-weight: 700; white-space: nowrap; }
      .badge.game { background: #123027; color: var(--green); }
      .badge.off { background: #2b191c; color: var(--red); }
      .badge.unk { background: #1e1e2a; color: var(--dim); }
      .account-none { color: var(--dim); font-style: italic; }
      .launchbar { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-top: 13px; }

      .console { background: #090910; border: 1px solid #1d1d2a; border-radius: 8px; padding: 11px; height: 215px; overflow: auto; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .log { margin: 0 0 10px; }
      .log .time { color: #66667c; }
      .log .cmd { color: var(--cyan); }
      .disabled-note { font-size: 11px; color: var(--dim); margin-top: 7px; }

      .modal-overlay { position: fixed; inset: 0; background: #000a; display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
      .modal { width: min(700px, 92vw); background: #12121b; border: 1px solid var(--border); border-radius: 14px; padding: 20px; box-shadow: 0 18px 50px #0007; max-height: 90vh; overflow-y: auto; }
      .modal h2 { margin: 0 0 5px; font-size: 17px; }
      .gridpreviewhead { display: flex; justify-content: space-between; align-items: baseline; margin-top: 16px; font-size: 10px; letter-spacing: .06em; color: var(--dim); }
      .gridpreviewhead .dims { color: var(--accent2); font-weight: 700; }
      .modalgrid { display: grid; gap: 7px; margin: 8px auto 18px; max-width: 100%; }
      .cell { background: #1c1c2a; border: 1px solid #343449; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--dim); padding: 4px; overflow: hidden; text-align: center; }
      .cell.filled { border-color: var(--accent); color: var(--accent); background: rgba(167,139,250,.08); font-weight: 700; }
      .cell .pname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
      .selects { display: flex; gap: 7px; }
      .selects select { background: #0f0f18; color: var(--ink); border: 1px solid var(--border); border-radius: 7px; padding: 7px; }
      .modalfoot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

      .empty { color: var(--dim); text-align: center; padding: 40px 0; font-size: 14px; }
      .not-found { color: var(--dim); padding: 40px 0; text-align: center; font-size: 14px; }
      .toast { position: fixed; right: 20px; bottom: 20px; background: #191923; border: 1px solid #39394d; padding: 11px 14px; border-radius: 8px; z-index: 20; box-shadow: 0 18px 50px #0007; font-size: 13px; }

      @media (max-width: 1000px) { .stats { grid-template-columns: repeat(2, 1fr); } .two { grid-template-columns: 1fr; } }
    `}</style>
  );

  if (loading) {
    return (
      <>
        {styles}
        <button className="back" onClick={() => router.push("/monitor")}>← Back to devices</button>
        <div className="empty">Memuat device...</div>
      </>
    );
  }

  if (!device) {
    return (
      <>
        {styles}
        <button className="back" onClick={() => router.push("/monitor")}>← Back to devices</button>
        <div className="not-found">Device tidak ditemukan atau sudah offline lama.</div>
      </>
    );
  }

  const ram = pctUsed(device.stats?.ram);
  const storage = pctStorageUsed(device.stats?.storage);

  return (
    <>
      {styles}
      <button className="back" onClick={() => router.push("/monitor")}>← Back to devices</button>

      <div className="top">
        <div>
          <div className="crumb">Monitor / Devices / <b>{displayName(device)}</b></div>
          {renaming ? (
            <div className="edit">
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
              />
              <button className="rename-btn" onClick={saveRename}>✓</button>
            </div>
          ) : (
            <h1>
              {displayName(device)}
              <button className="rename-btn" onClick={() => { setRenaming(true); setRenameDraft(displayName(device)); }}>✎</button>
            </h1>
          )}
          <div className="sub">
            {device.hostname} &bull; Android/Termux &bull; HWID {device.deviceId.slice(0, 8)}… &bull; Updated {ago(device.lastSeen)}
          </div>
        </div>
        <div className="detail-actions">
          <span className={`live ${device.status !== "online" ? "offline" : ""}`}>
            <span className="dot" /> DEVICE {device.status.toUpperCase()}
          </span>
          <button className="btn" disabled>Screenshot — unavailable</button>
          <button className="btn" disabled>Restart — unavailable</button>
        </div>
      </div>

      <div className="stats">
        {device.stats?.battery && device.stats.battery.percent != null && (
          <div className={`stat ${device.stats.battery.percent < 20 ? "red" : "green"}`}>
            <div className="label">BATTERY</div>
            <div className="value">{device.stats.battery.percent}%</div>
            <small>{device.stats.battery.charging ? "⚡ Charging" : "Not charging"}</small>
          </div>
        )}
        {device.stats?.ram && (
          <div className={`stat ${ram >= 85 ? "red" : "cyan"}`}>
            <div className="label">RAM</div>
            <div className="value">{fmtMB(device.stats.ram.usedMB)} / {fmtMB(device.stats.ram.totalMB)}</div>
            <small>{ram}% used</small>
          </div>
        )}
        {device.stats?.storage && (
          <div className="stat yellow">
            <div className="label">STORAGE</div>
            <div className="value">{fmtMB(device.stats.storage.freeMB)} free</div>
            <small>{storage}% used</small>
          </div>
        )}
        {device.stats?.load && (
          <div className="stat green">
            <div className="label">CPU LOAD</div>
            <div className="value">{device.stats.load["1m"].toFixed(2)}</div>
            <small>1 minute load</small>
          </div>
        )}
        {device.screen && (
          <div className="stat cyan">
            <div className="label">SCREEN</div>
            <div className="value">{device.screen.width} × {device.screen.height}</div>
            <small>resolution</small>
          </div>
        )}
      </div>

      <div className="two">
        <section className="panel">
          <div className="panelhead">
            <h3>Roblox Packages</h3>
            <span className="muted">{pkgs.length} detected</span>
          </div>
          {pkgs.length === 0 ? (
            <div className="empty">Belum ada package terdeteksi di device ini.</div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}>
                      <input type="checkbox" checked={selectedPkgs.length === pkgs.length && pkgs.length > 0} onChange={(e) => toggleAll(e.target.checked)} />
                    </th>
                    <th>PACKAGE</th>
                    <th>ACCOUNT</th>
                    <th>SESSION</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
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
                        <td>{p.pkg}</td>
                        <td>{p.username ? p.username : <span className="account-none">belum terdeteksi</span>}</td>
                        <td>{sessionSecs != null ? fmtSession(sessionSecs) : "—"}</td>
                        <td>
                          {p.username ? (
                            <span className={`badge ${acc?.online ? "game" : "off"}`}>{acc?.online ? "IN GAME" : "DISCONNECTED"}</span>
                          ) : (
                            <span className="badge unk">UNKNOWN</span>
                          )}
                        </td>
                        <td>
                          <button className="btn" disabled={launchingBatch || device.status !== "online"} onClick={() => launchMany([p])}>
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="launchbar">
                <span className="muted">Multi-select &middot; batch launch</span>
                <button
                  className="btn"
                  disabled={selectedPkgs.length === 0 || launchingBatch || device.status !== "online"}
                  onClick={autoGridAndApply}
                  title="Computes a near-square grid for the selected packages and applies it immediately"
                >
                  {launchingBatch ? "Mengirim..." : `Auto Grid & Apply (${selectedPkgs.length})`}
                </button>
                <button
                  className="btn primary"
                  disabled={selectedPkgs.length === 0 || launchingBatch || device.status !== "online"}
                  onClick={() => launchMany(selectedPkgs)}
                >
                  {launchingBatch ? "Mengirim..." : `Launch selected (${selectedPkgs.length})`}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panelhead">
            <h3>Command Console</h3>
            <span className="muted">launch history</span>
          </div>
          <div className="console">
            {consoleLog.length === 0 ? (
              <div className="log muted">Belum ada command yang dikirim.</div>
            ) : (
              consoleLog.map((entry) => (
                <div key={entry.id} className="log">
                  <span className="time">{fmtClock(entry.ts)}</span> <span className="cmd">{entry.action}</span> → {entry.packages.join(", ")}
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              className="btn"
              onClick={() => { setDraftLayout(selectedPkgs.length > 0 ? autoGridDims(selectedPkgs.length) : layout); setGridModalOpen(true); }}
            >
              Grid Layout Configuration
            </button>
            <div className="disabled-note">
              "Save preview" is visual only. "Apply to device" inside the modal actually resizes windows on the
              real device — this relies on the cloud phone's built-in freeform windowing and skips the settings
              toggle that caused a restart before. Still test on one device first.
            </div>
          </div>
        </section>
      </div>

      {gridModalOpen && (
        <div className="modal-overlay" onClick={() => setGridModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Grid Layout Configuration</h2>
            <div className="muted">
              Cols/rows auto-suggested from your checked packages ({selectedPkgs.length}) — override below if you
              want a different shape. Save preview (visual only) or Apply to device (test) to actually resize
              windows on the real device.
            </div>
            <div className="gridpreviewhead">
              <span>LAYOUT PREVIEW</span>
              <span className="dims">
                {draftLayout.rows} ROWS &times; {draftLayout.cols} COLUMNS ({draftLayout.rows * draftLayout.cols} SLOTS)
              </span>
            </div>
            {(() => {
              // Locked to the actual device's screen aspect ratio (fallback
              // to a typical portrait phone if we don't have it yet) --
              // rows/cols only subdivide this fixed shape, they never resize
              // the box itself. Matches HipHub: the outer frame stays put,
              // only the internal split changes. Computed in px (not CSS
              // aspect-ratio auto-sizing, which doesn't reliably shrink a
              // plain block grid to fit both a max-width AND max-height at
              // once) so the preview is guaranteed to actually match shape.
              const sw = device.screen?.width || 1080;
              const sh = device.screen?.height || 1920;
              const maxW = 620;
              const maxH = 380;
              const scale = Math.min(maxW / sw, maxH / sh);
              const previewW = Math.round(sw * scale);
              const previewH = Math.round(sh * scale);
              return (
                <div
                  className="modalgrid"
                  style={{
                    gridTemplateColumns: `repeat(${draftLayout.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${draftLayout.rows}, 1fr)`,
                    width: previewW,
                    height: previewH,
                  }}
                >
                  {Array.from({ length: draftLayout.cols * draftLayout.rows }).map((_, slot) => {
                    const p = selectedPkgs[slot];
                    return (
                      <div key={slot} className={`cell ${p ? "filled" : ""}`}>
                        {p ? <span className="pname">{p.username || p.label || p.pkg}</span> : `#${slot + 1}`}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="selects">
              <select value={draftLayout.cols} onChange={(e) => setDraftLayout((l) => ({ ...l, cols: Number(e.target.value) }))}>
                {Array.from({ length: 8 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} columns</option>)}
              </select>
              <select value={draftLayout.rows} onChange={(e) => setDraftLayout((l) => ({ ...l, rows: Number(e.target.value) }))}>
                {Array.from({ length: 8 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} rows</option>)}
              </select>
            </div>
            <div className="modalfoot">
              <button className="btn" onClick={() => setGridModalOpen(false)}>Close</button>
              <button className="btn" onClick={() => { setLayout(draftLayout); setGridModalOpen(false); setToast("Preview saved locally — not applied to device"); }}>
                Save preview
              </button>
              <button
                className="btn primary"
                disabled={launchingBatch || device.status !== "online"}
                onClick={applyGridToDevice}
                title="Launches the checked packages and resizes their windows to this grid on the real device"
              >
                Apply to device (test)
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
