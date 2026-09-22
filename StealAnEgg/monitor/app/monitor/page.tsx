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
  cpuCores?: number;
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

function ago(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "unknown";
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
  const [showCommand, setShowCommand] = useState(false);
  const [command, setCommand] = useState("");
  const [commandLoading, setCommandLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editAllOpen, setEditAllOpen] = useState(false);
  const [editPsLink, setEditPsLink] = useState("");
  const [editCols, setEditCols] = useState(4);
  const [editRows, setEditRows] = useState(3);
  const [editApplyGrid, setEditApplyGrid] = useState(false);
  const [editApplyPs, setEditApplyPs] = useState(false);
  const [editApplyDelays, setEditApplyDelays] = useState(false);
  const [editRejoinDelay, setEditRejoinDelay] = useState(10);
  const [editLaunchDelay, setEditLaunchDelay] = useState(10);
  const [editSaving, setEditSaving] = useState(false);

  const [agentCfgOpen, setAgentCfgOpen] = useState(false);
  const [agentCfg, setAgentCfg] = useState<Record<string, number>>({});
  const [agentDefaults, setAgentDefaults] = useState<Record<string, number>>({});
  const [agentCfgLoading, setAgentCfgLoading] = useState(false);
  const [agentCfgSaving, setAgentCfgSaving] = useState(false);
  const [agentCopied, setAgentCopied] = useState(false);

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

  async function openCommandModal() {
    setShowCommand(true);
    if (command) return;
    setCommandLoading(true);
    try {
      const res = await fetch("/api/device-control/bootstrap-command");
      const data = await res.json();
      setCommand(data.command || "");
    } catch {}
    setCommandLoading(false);
  }

  function copyCommand() {
    if (!command) return;
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function deleteDevice(e: React.MouseEvent, deviceId: string, name: string) {
    e.stopPropagation();
    if (!window.confirm(`Hapus device "${name}"? Data device akan dihapus permanen.`)) return;
    try {
      const res = await fetch("/api/device-control/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      if (data.ok) {
        setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
        setToast("Device dihapus");
      } else {
        setToast("Gagal: " + data.error);
      }
    } catch (err: any) {
      setToast("Gagal: " + err.message);
    }
  }

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

  async function saveEditAll() {
    const payload: any = {};
    if (editApplyPs) payload.psLink = editPsLink.trim();
    if (editApplyGrid) { payload.cols = editCols; payload.rows = editRows; }
    if (editApplyDelays) { payload.rejoinDelay = editRejoinDelay; payload.launchDelay = editLaunchDelay; }
    if (!editApplyPs && !editApplyGrid && !editApplyDelays) { setToast("Pilih minimal satu opsi"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/device-control/policy/edit-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setToast(`Edit selesai: ${data.updated} device diupdate`);
        setEditAllOpen(false);
      } else {
        setToast("Gagal: " + data.error);
      }
    } catch (err: any) {
      setToast("Gagal: " + err.message);
    }
    setEditSaving(false);
  }

  async function resetAllPolicies() {
    if (!window.confirm("Reset SEMUA device?\n\n• Auto Rejoin → OFF\n• Semua PS Link → dihapus\n\nDevice cuma bisa launch Roblox, tanpa auto rejoin.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/device-control/policy/reset-all", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setToast(`Reset selesai: ${data.updated} device diupdate`);
      } else {
        setToast("Gagal: " + data.error);
      }
    } catch (err: any) {
      setToast("Gagal: " + err.message);
    }
    setResetting(false);
  }

  const AGENT_CFG_LABELS: Record<string, { label: string; desc: string; unit: string }> = {
    HEARTBEAT_INTERVAL: { label: "Heartbeat Interval", desc: "Interval kirim heartbeat ke server", unit: "detik" },
    RECONNECT_DELAY: { label: "Reconnect Delay", desc: "Delay sebelum reconnect ke server", unit: "detik" },
    RAM_TRIM_PCT: { label: "RAM Trim Per-Clone", desc: "Trim clone jika RSS melebihi % ini dari total RAM device", unit: "%" },
    POLICY_POLL_INTERVAL: { label: "Policy Poll Interval", desc: "Interval cek policy dari server", unit: "detik" },
    STUCK_GRACE: { label: "Stuck Grace Period", desc: "Berapa lama clone boleh stuck sebelum force rejoin", unit: "detik" },
    REJOIN_SWEEP_INTERVAL: { label: "Rejoin Sweep Interval", desc: "Interval cek rejoin semua package", unit: "detik" },
  };

  async function openAgentConfig() {
    setAgentCfgOpen(true);
    setAgentCfgLoading(true);
    try {
      const res = await fetch("/api/device-control/agent-config");
      const data = await res.json();
      if (data.ok) {
        setAgentCfg(data.config);
        setAgentDefaults(data.defaults);
      }
    } catch {}
    setAgentCfgLoading(false);
  }

  async function saveAgentConfig() {
    setAgentCfgSaving(true);
    try {
      const res = await fetch("/api/device-control/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentCfg),
      });
      const data = await res.json();
      if (data.ok) {
        setAgentCfg(data.config);
        setToast("Agent config disimpan!");
      } else {
        setToast("Gagal: " + data.error);
      }
    } catch (err: any) {
      setToast("Gagal: " + err.message);
    }
    setAgentCfgSaving(false);
  }

  async function copyAgentScript() {
    try {
      const res = await fetch("/api/termux/agent?key=YOUR_KEY_HERE");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setAgentCopied(true);
      setTimeout(() => setAgentCopied(false), 2000);
    } catch {
      setToast("Gagal copy agent script");
    }
  }

  const online = devices.filter((d) => d.status === "online");
  const offline = devices.filter((d) => d.status !== "online");
  const totalPackages = devices.reduce((a, d) => a + (d.packages?.length ?? 0), 0);
  // Sort by display name using natural order so SAE11 < SAE21 < SAE101 (not
  // lexicographic where "SAE101" would come before "SAE21").
  const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const visible = devices
    .filter((d) => filter === "all" || d.status === filter)
    .slice()
    .sort((a, b) => nameCollator.compare(displayName(a), displayName(b)));

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
        .device-actions { display: flex; gap: 8px; margin-top: 12px; }
        .openbtn { border: 1px solid var(--border); background: #181823; color: var(--ink); padding: 9px 13px; border-radius: 8px; flex: 1; }
        .openbtn:hover { border-color: #44445a; }
        .delbtn { border: 1px solid #3b1c1c; background: #1c1012; color: var(--red); padding: 9px 13px; border-radius: 8px; font-size: 12px; white-space: nowrap; }
        .delbtn:hover { border-color: var(--red); }

        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
        .toast { position: fixed; right: 20px; bottom: 20px; background: #191923; border: 1px solid #39394d; padding: 11px 14px; border-radius: 8px; z-index: 20; box-shadow: 0 18px 50px #0007; font-size: 13px; }

        .gen-btn { border: 1px solid var(--border); background: #181823; color: var(--cyan); padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; white-space: nowrap; }
        .gen-btn:hover { border-color: var(--cyan); }
        .reset-btn { border: 1px solid #3b2c1c; background: #1c1510; color: var(--yellow); padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; }
        .reset-btn:hover { border-color: var(--yellow); }
        .reset-btn:disabled { opacity: .5; cursor: not-allowed; }

        .modal-overlay { position: fixed; inset: 0; background: #000a; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 24px; max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto; }
        .modal h2 { margin: 0 0 6px; font-size: 18px; }
        .modal .msub { color: var(--dim); font-size: 13px; margin-bottom: 18px; }
        .modal .mlabel { color: var(--cyan); font-size: 12px; font-weight: 800; letter-spacing: .5px; margin-bottom: 10px; }
        .modal .command-box { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; font-family: "Cascadia Code", "Fira Code", monospace; font-size: 13px; word-break: break-all; color: var(--green); display: flex; align-items: center; gap: 12px; }
        .modal .command-text { flex: 1; }
        .modal .copy-btn { background: var(--accent); color: #1a1030; border: none; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .modal .copy-btn:hover { filter: brightness(1.1); }
        .modal .steps { color: var(--dim); font-size: 13px; line-height: 1.8; margin-top: 16px; }
        .modal .steps code { background: #1c1c2b; padding: 2px 6px; border-radius: 4px; color: var(--ink); font-size: 12px; }
        .modal .close-btn { border: 1px solid var(--border); background: transparent; color: var(--dim); padding: 8px 16px; border-radius: 8px; font-size: 13px; margin-top: 16px; }
        .modal .close-btn:hover { color: var(--ink); border-color: #44445a; }

        .edit-all-btn { border: 1px solid #1c3b2c; background: #101c15; color: var(--green); padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; }
        .edit-all-btn:hover { border-color: var(--green); }
        .eafield { margin-bottom: 16px; }
        .eafield label { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; }
        .eafield input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
        .eainput { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--ink); font: inherit; font-size: 13px; margin-top: 8px; outline: none; }
        .eainput:focus { border-color: var(--accent); }
        .eainput:disabled { opacity: .4; }
        .eagrid { display: flex; gap: 10px; margin-top: 8px; }
        .eagrid select { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--ink); font: inherit; font-size: 13px; }
        .eagrid select:disabled { opacity: .4; }
        .easave { background: var(--accent); color: #1a1030; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 800; cursor: pointer; }
        .easave:hover { filter: brightness(1.1); }
        .easave:disabled { opacity: .5; cursor: not-allowed; }

        .agent-cfg-btn { border: 1px solid #2a1c3b; background: #1a1028; color: var(--accent); padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; }
        .agent-cfg-btn:hover { border-color: var(--accent); }
        .acf-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .acf-row:last-child { border-bottom: none; }
        .acf-info { flex: 1; }
        .acf-label { color: var(--ink); font-size: 13px; font-weight: 600; }
        .acf-desc { color: var(--dim); font-size: 11px; margin-top: 2px; }
        .acf-input { width: 90px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--ink); font: inherit; font-size: 13px; text-align: center; outline: none; }
        .acf-input:focus { border-color: var(--accent); }
        .acf-unit { color: var(--dim); font-size: 12px; min-width: 40px; }
        .acf-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
        .acf-reset { background: transparent; border: 1px solid var(--border); color: var(--dim); padding: 8px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; }
        .acf-reset:hover { color: var(--ink); border-color: #44445a; }
        .acf-copy { background: var(--green); color: #0a1a10; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; }
        .acf-copy:hover { filter: brightness(1.1); }

        @media (max-width: 1000px) { .stats { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      <div className="top">
        <div>
          <div className="crumb">Monitor / <b>Devices</b></div>
          <h1>Device Monitor</h1>
          <div className="sub">Termux root devices &bull; polling every 10 seconds</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="gen-btn" onClick={() => router.push("/monitor/overview")}>Fleet Overview</button>
          <button className="gen-btn" onClick={openCommandModal}>+ Generate Command</button>
          <button className="edit-all-btn" onClick={() => setEditAllOpen(true)}>Edit All Policies</button>
          <button className="agent-cfg-btn" onClick={openAgentConfig}>Agent Config</button>
          <button className="reset-btn" disabled={resetting} onClick={resetAllPolicies}>{resetting ? "Resetting..." : "Reset All Policies"}</button>
          <span className="live"><span className="dot" /> LIVE</span>
        </div>
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
          <button onClick={openCommandModal} style={{ color: "var(--cyan)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", font: "inherit" }}>Generate command</button> untuk menambahkan device.
        </div>
      ) : (
        <div className="grid">
          {visible.map((d) => {
            const ram = pctUsed(d.stats?.ram);
            const storage = pctStorageUsed(d.stats?.storage);
            const cores = d.stats?.cpuCores || 4;
            const cpu = d.stats?.load ? Math.min(100, Math.round((d.stats.load["1m"] / cores) * 100)) : 0;
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
                  <span className="pkg">{d.packages?.length ?? 0} Roblox package{(d.packages?.length ?? 0) !== 1 ? "s" : ""}</span>
                  <span>Updated {ago(d.lastSeen)}</span>
                </div>
                <div className="device-actions">
                  <button className="openbtn" onClick={(e) => { e.stopPropagation(); router.push(`/monitor/${d.deviceId}`); }}>
                    Open device →
                  </button>
                  <button className="delbtn" onClick={(e) => deleteDevice(e, d.deviceId, displayName(d))}>
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCommand && (
        <div className="modal-overlay" onClick={() => setShowCommand(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Generate Command</h2>
            <div className="msub">Command tetap (key sudah dipatenkan) — tinggal copy &amp; paste ke Termux / Cloud instance manapun.</div>
            <div className="mlabel">COMMAND</div>
            {commandLoading ? (
              <div style={{ color: "var(--dim)", fontSize: 13 }}>Memuat...</div>
            ) : command ? (
              <div className="command-box">
                <div className="command-text">{command}</div>
                <button className="copy-btn" onClick={copyCommand}>{copied ? "Copied!" : "Copy"}</button>
              </div>
            ) : (
              <div style={{ color: "var(--red)", fontSize: 13 }}>ACCESS_KEY belum diset di server (.env).</div>
            )}
            <div className="steps">
              1. Buka <code>Termux</code> di HP atau Cloud instance<br />
              2. Paste command di atas — sama persis buat semua device<br />
              3. Setiap instance otomatis generate <code>deviceId</code> unik<br />
              4. Device akan muncul di halaman ini<br />
              5. Heartbeat dikirim setiap 2 menit untuk update status
            </div>
            <button className="close-btn" onClick={() => setShowCommand(false)}>Tutup</button>
          </div>
        </div>
      )}

      {editAllOpen && (
        <div className="modal-overlay" onClick={() => setEditAllOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit All Policies</h2>
            <div className="msub">Terapkan pengaturan Grid &amp; PS Link ke semua device sekaligus.</div>

            <div className="eafield">
              <label>
                <input type="checkbox" checked={editApplyPs} onChange={(e) => setEditApplyPs(e.target.checked)} />
                Set PS Link (Private Server)
              </label>
              <input
                className="eainput"
                disabled={!editApplyPs}
                placeholder="https://www.roblox.com/games/..."
                value={editPsLink}
                onChange={(e) => setEditPsLink(e.target.value)}
              />
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>
                Kosongkan untuk menghapus semua PS link
              </div>
            </div>

            <div className="eafield">
              <label>
                <input type="checkbox" checked={editApplyGrid} onChange={(e) => setEditApplyGrid(e.target.checked)} />
                Set Grid Layout
              </label>
              <div className="eagrid">
                <select disabled={!editApplyGrid} value={editCols} onChange={(e) => setEditCols(Number(e.target.value))}>
                  {Array.from({ length: 8 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} columns</option>)}
                </select>
                <select disabled={!editApplyGrid} value={editRows} onChange={(e) => setEditRows(Number(e.target.value))}>
                  {Array.from({ length: 8 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} rows</option>)}
                </select>
              </div>
            </div>

            <div className="eafield">
              <label>
                <input type="checkbox" checked={editApplyDelays} onChange={(e) => setEditApplyDelays(e.target.checked)} />
                Set Delays
              </label>
              <div className="eagrid">
                <div style={{ flex: 1 }}>
                  <div style={{ color: "var(--dim)", fontSize: 11, marginBottom: 4 }}>Rejoin Delay (detik)</div>
                  <input className="eainput" type="number" min={1} max={600} disabled={!editApplyDelays} value={editRejoinDelay} onChange={(e) => setEditRejoinDelay(Number(e.target.value))} style={{ marginTop: 0 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "var(--dim)", fontSize: 11, marginBottom: 4 }}>Launch Delay (detik)</div>
                  <input className="eainput" type="number" min={0} max={300} disabled={!editApplyDelays} value={editLaunchDelay} onChange={(e) => setEditLaunchDelay(Number(e.target.value))} style={{ marginTop: 0 }} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="close-btn" onClick={() => setEditAllOpen(false)}>Batal</button>
              <button className="easave" disabled={editSaving || (!editApplyPs && !editApplyGrid && !editApplyDelays)} onClick={saveEditAll}>
                {editSaving ? "Menyimpan..." : "Terapkan ke Semua Device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {agentCfgOpen && (
        <div className="modal-overlay" onClick={() => setAgentCfgOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2>Agent Config</h2>
            <div className="msub">Edit konstanta Termux agent. Perubahan berlaku saat agent di-download ulang.</div>
            {agentCfgLoading ? (
              <div style={{ color: "var(--dim)", padding: 20, textAlign: "center" }}>Loading...</div>
            ) : (
              <>
                {Object.entries(AGENT_CFG_LABELS).map(([key, { label, desc, unit }]) => (
                  <div className="acf-row" key={key}>
                    <div className="acf-info">
                      <div className="acf-label">{label}</div>
                      <div className="acf-desc">{desc} (default: {agentDefaults[key]})</div>
                    </div>
                    <input
                      className="acf-input"
                      type="number"
                      min={1}
                      value={agentCfg[key] ?? agentDefaults[key] ?? 0}
                      onChange={(e) => setAgentCfg((c) => ({ ...c, [key]: Number(e.target.value) }))}
                    />
                    <span className="acf-unit">{unit}</span>
                  </div>
                ))}
                <div className="acf-actions">
                  <button className="acf-reset" onClick={() => setAgentCfg({ ...agentDefaults })}>Reset Default</button>
                  <button className="close-btn" style={{ margin: 0 }} onClick={() => setAgentCfgOpen(false)}>Tutup</button>
                  <button className="easave" disabled={agentCfgSaving} onClick={saveAgentConfig}>
                    {agentCfgSaving ? "Menyimpan..." : "Simpan"}
                  </button>
                  <button className="acf-copy" onClick={copyAgentScript}>
                    {agentCopied ? "Copied!" : "Copy Agent Script"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
