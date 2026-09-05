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

// Turn whatever the user pasted into a Roblox deep link the Android VIEW
// intent can act on. Accepts: full https URL, a bare placeId, or an already-
// formed roblox:// URI. Returns "" if nothing usable was pasted.
function parseRobloxTarget(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  // Already a deep link -- pass through.
  if (/^roblox:\/\//i.test(s)) return s;
  // Bare number -> placeId.
  if (/^\d+$/.test(s)) return `roblox://placeId=${s}`;
  // Try to parse as URL.
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    // Standard game share: /games/<placeId>/<slug>
    const m = u.pathname.match(/\/games\/(\d+)/i);
    const placeId = m ? m[1] : null;
    const linkCode = u.searchParams.get("privateServerLinkCode");
    if (placeId && linkCode) {
      return `roblox://placeId=${placeId}&linkCode=${linkCode}`;
    }
    if (placeId) return `roblox://placeId=${placeId}`;
    // /share?code=... style private-server share links.
    const shareCode = u.searchParams.get("code");
    if (u.pathname.startsWith("/share") && shareCode) {
      return `roblox://navigation/share_links?code=${shareCode}&type=Server`;
    }
  } catch {}
  // Nothing recognizable -- return as-is so the agent can try it anyway.
  return s;
}

function shortTarget(t?: string): string {
  if (!t) return "";
  const m = t.match(/placeId=(\d+)/);
  const placeId = m ? m[1] : "?";
  const hasCode = /linkCode=|share_links\?code=/.test(t);
  return hasCode ? `PS ${placeId}` : `place ${placeId}`;
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
  const [launchDelay, setLaunchDelay] = useState(10);
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [launchingBatch, setLaunchingBatch] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [toast, setToast] = useState("");

  // Execution policy -- persisted per-device in Redis, shared with the agent
  // so it can act on disconnected packages autonomously (auto-rejoin) and
  // respect a user-configured launch delay + retry cap.
  const [autoRejoinEnabled, setAutoRejoinEnabled] = useState(false);
  const [rejoinDelay, setRejoinDelay] = useState(10);
  const [retryLimit, setRetryLimit] = useState(0); // 0 = unlimited
  const [autoRejoinPkgs, setAutoRejoinPkgs] = useState<Record<string, boolean>>({});
  const [packageTargets, setPackageTargets] = useState<Record<string, string>>({});
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);

  // "Link Private Server" modal state.
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkTargetPkg, setLinkTargetPkg] = useState<string | null>(null); // null = batch (all selected)

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

      // Skip loading stale log history for a live device -- once the device
      // is online the console shows only the current session's events (fed
      // from newer launches). Offline devices keep showing their last-known
      // log so operators still have a paper trail.
      if (found && found.status === "online") {
        setConsoleLog([]);
      } else {
        const logData = await logRes.json();
        setConsoleLog((logData.entries || []).slice().reverse()); // oldest first, like a real console
      }
    } catch {}
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
    const id = setInterval(fetchDevice, 10000);
    return () => clearInterval(id);
  }, [fetchDevice]);

  // Load persisted policy for this device once. Rehydrates UI toggles from
  // whatever the agent is currently obeying so the two never drift.
  useEffect(() => {
    if (!deviceId) return;
    (async () => {
      try {
        const res = await fetch(`/api/device-control/policy?deviceId=${encodeURIComponent(deviceId)}`);
        const data = await res.json();
        if (data.ok && data.policy) {
          setAutoRejoinEnabled(!!data.policy.autoRejoinEnabled);
          setRejoinDelay(data.policy.rejoinDelay || 10);
          setRetryLimit(data.policy.retryLimit || 0);
          setLaunchDelay(data.policy.launchDelay || 10);
          const map: Record<string, boolean> = {};
          for (const p of data.policy.autoRejoinPackages || []) map[p] = true;
          setAutoRejoinPkgs(map);
          setPackageTargets(data.policy.packageTargets || {});
        }
      } catch {}
      setPolicyLoaded(true);
    })();
  }, [deviceId]);

  async function savePolicy() {
    setSavingPolicy(true);
    try {
      // Empty package list means "apply to all packages" -- makes the
      // common "turn on for everything" case a single toggle instead of
      // needing to tick every row.
      const autoRejoinPackages = Object.entries(autoRejoinPkgs)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const res = await fetch("/api/device-control/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          autoRejoinEnabled,
          rejoinDelay,
          retryLimit,
          autoRejoinPackages,
          launchDelay,
          packageTargets,
        }),
      });
      const data = await res.json();
      setToast(data.ok ? "Execution policy saved" : `Gagal: ${data.error}`);
    } catch (e: any) {
      setToast("Gagal: " + e.message);
    }
    setSavingPolicy(false);
  }

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
      // Ship the current per-package target map so each launched clone can
      // deep-link straight into its assigned place / private server instead
      // of Roblox's home screen.
      const targets: Record<string, string> = {};
      for (const p of list) if (packageTargets[p.pkg]) targets[p.pkg] = packageTargets[p.pkg];
      const res = await fetch("/api/device-control/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, packageNames: list.map((p) => p.pkg), cols: g.cols, rows: g.rows, resize, launchDelay, targets }),
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

  // Open "Link Private Server" for a single package (pkg name given) or for
  // the current batch of selected packages (pkg = null).
  function openLinkModal(pkg: string | null) {
    setLinkTargetPkg(pkg);
    // Prefill with the existing target if editing a single package.
    setLinkDraft(pkg ? (packageTargets[pkg] || "") : "");
    setLinkModalOpen(true);
  }

  async function confirmLink() {
    const parsed = parseRobloxTarget(linkDraft);
    const targets = linkTargetPkg ? [linkTargetPkg] : selectedPkgs.map((p) => p.pkg);
    if (targets.length === 0) {
      setToast("Pilih dulu package di tabel");
      return;
    }
    const next = { ...packageTargets };
    if (parsed) {
      for (const t of targets) next[t] = parsed;
    } else {
      for (const t of targets) delete next[t];
    }
    setPackageTargets(next);
    setLinkModalOpen(false);
    setLinkDraft("");
    setLinkTargetPkg(null);

    // Persist immediately so a page refresh doesn't lose the mapping and so
    // the agent (once auto-rejoin lands) can pick it up on its next poll.
    setSavingPolicy(true);
    try {
      const autoRejoinPackages = Object.entries(autoRejoinPkgs)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const res = await fetch("/api/device-control/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          autoRejoinEnabled,
          rejoinDelay,
          retryLimit,
          autoRejoinPackages,
          launchDelay,
          packageTargets: next,
        }),
      });
      const data = await res.json();
      setToast(
        data.ok
          ? parsed
            ? `Target set for ${targets.length} package${targets.length > 1 ? "s" : ""}`
            : `Target cleared for ${targets.length} package${targets.length > 1 ? "s" : ""}`
          : `Gagal: ${data.error}`
      );
    } catch (e: any) {
      setToast("Gagal: " + e.message);
    }
    setSavingPolicy(false);
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

      /* Quick Controls -- execution policy panel */
      .qc-row { margin-bottom: 14px; }
      .qc-switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
      .qc-switch input { width: 16px; height: 16px; accent-color: var(--accent); }
      .qc-switch span { font-size: 13px; font-weight: 600; }
      .qc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .qc-grid label { display: block; }
      .qc-lbl { font-size: 10px; letter-spacing: .06em; color: var(--dim); margin-bottom: 4px; font-weight: 700; }
      .qc-inp { display: flex; align-items: center; gap: 6px; background: #0e0e16; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }
      .qc-inp input { flex: 1; background: transparent; border: 0; color: var(--ink); font-size: 13px; text-align: center; outline: none; }
      .qc-inp span { color: var(--dim); font-size: 11px; white-space: nowrap; }

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
                    <th title="Auto-rejoin this package when it drops offline">REJOIN</th>
                    <th title="Roblox place / private server this clone opens into">TARGET</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {pkgs.map((p) => {
                    const acc = p.username ? accounts[p.username] : undefined;
                    // Session time: live-growing while account is online, but
                    // FROZEN at (lastSeen - firstSeen) once it goes offline
                    // instead of collapsing to "—". Lets the operator see how
                    // long the session lasted before it dropped, even after
                    // the device stops heartbeating.
                    const sessionSecs = acc?.firstSeen
                      ? acc.online
                        ? Math.max(0, Date.now() / 1000 - acc.firstSeen)
                        : acc.lastSeen
                          ? Math.max(0, acc.lastSeen - acc.firstSeen)
                          : null
                      : null;
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
                          <input
                            type="checkbox"
                            checked={!!autoRejoinPkgs[p.pkg]}
                            onChange={(e) => setAutoRejoinPkgs((prev) => ({ ...prev, [p.pkg]: e.target.checked }))}
                            title={autoRejoinEnabled ? "Auto-rejoin ON for this package" : "Enable global 'Auto rejoin' in Quick Controls first"}
                          />
                        </td>
                        <td>
                          <button
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => openLinkModal(p.pkg)}
                            title={packageTargets[p.pkg] || "Set Roblox target link"}
                          >
                            {packageTargets[p.pkg] ? shortTarget(packageTargets[p.pkg]) : "＋ Link"}
                          </button>
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
                  disabled={selectedPkgs.length === 0}
                  onClick={() => openLinkModal(null)}
                  title="Set the same Roblox place / private server link on every selected package"
                >
                  Link Private Server ({selectedPkgs.length})
                </button>
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
              Grid only stores window positions -- launching still uses the "Launch selected" button.
              Test on one device before rolling out.
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panelhead">
            <h3>Quick Controls</h3>
            <span className={`badge ${autoRejoinEnabled ? "game" : "off"}`}>
              {autoRejoinEnabled ? "AUTO REJOIN ON" : "AUTO REJOIN OFF"}
            </span>
          </div>

          <div className="qc-row">
            <label className="qc-switch">
              <input
                type="checkbox"
                checked={autoRejoinEnabled}
                onChange={(e) => setAutoRejoinEnabled(e.target.checked)}
              />
              <span>Auto rejoin</span>
            </label>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Reconnect disconnected instances automatically. Pick which packages in the table
              (REJOIN column) — none checked means all packages.
            </div>
          </div>

          <div className="qc-grid">
            <label>
              <div className="qc-lbl">REJOIN DELAY</div>
              <div className="qc-inp">
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={rejoinDelay}
                  onChange={(e) => setRejoinDelay(Math.max(1, Number(e.target.value) || 1))}
                />
                <span>sec</span>
              </div>
            </label>
            <label>
              <div className="qc-lbl">RETRY LIMIT</div>
              <div className="qc-inp">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={retryLimit}
                  onChange={(e) => setRetryLimit(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0 = unlimited"
                />
                <span>{retryLimit === 0 ? "unlimited" : "tries"}</span>
              </div>
            </label>
            <label>
              <div className="qc-lbl">LAUNCH DELAY</div>
              <div className="qc-inp">
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={launchDelay}
                  onChange={(e) => setLaunchDelay(Math.max(0, Number(e.target.value) || 0))}
                />
                <span>sec</span>
              </div>
            </label>
          </div>

          <button
            className="btn primary"
            style={{ width: "100%", marginTop: 12 }}
            disabled={savingPolicy || !policyLoaded}
            onClick={savePolicy}
          >
            {savingPolicy ? "Saving..." : "Save execution policy"}
          </button>
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
              // to a landscape shape if we don't have it yet -- these
              // cloud-phone farm devices run landscape, never portrait) --
              // rows/cols only subdivide this fixed shape, they never resize
              // the box itself. Matches HipHub: the outer frame stays put,
              // only the internal split changes. Computed in px (not CSS
              // aspect-ratio auto-sizing, which doesn't reliably shrink a
              // plain block grid to fit both a max-width AND max-height at
              // once) so the preview is guaranteed to actually match shape.
              //
              // NOTE: if this still renders portrait for a real device, the
              // Termux agent on that device hasn't been reinstalled since
              // the rotation-aware collect_screen() fix -- it's still
              // reporting stale unswapped (portrait) numbers from before.
              // Re-run the bootstrap curl command on that device to pick up
              // the fix.
              const sw = device.screen?.width || 1920;
              const sh = device.screen?.height || 1080;
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
                    const used = slot < selectedPkgs.length;
                    return (
                      <div key={slot} className={`cell ${used ? "filled" : ""}`}>
                        #{slot + 1}
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
              <span style={{ color: "var(--dim)", fontSize: 11 }}>
                Launch delay: <b style={{ color: "var(--ink)" }}>{launchDelay}s</b> (set in Quick Controls)
              </span>
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

      {linkModalOpen && (
        <div className="modal-overlay" onClick={() => setLinkModalOpen(false)}>
          <div className="modal" style={{ width: "min(460px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 13, letterSpacing: ".08em", color: "var(--dim)", margin: "0 0 4px" }}>
              LINK PRIVATE SERVER
            </h2>
            <div className="muted" style={{ marginBottom: 14 }}>
              {linkTargetPkg
                ? `For package ${linkTargetPkg}`
                : `For ${selectedPkgs.length} package${selectedPkgs.length !== 1 ? "s" : ""} on device "${displayName(device)}".`}
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
              Paste a Roblox place URL, private server URL, `roblox://` deep link, or just a Place ID.
              Leave empty and Confirm to clear.
            </div>
            <input
              autoFocus
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="Place ID or PS Link URL"
              style={{
                width: "100%",
                background: "#0e0e16",
                border: "1px solid var(--accent)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "var(--ink)",
                fontSize: 13,
                outline: "none",
              }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmLink(); }}
            />
            {linkDraft.trim() && (
              <div className="muted" style={{ fontSize: 11, marginTop: 8, wordBreak: "break-all" }}>
                Will resolve to: <code style={{ color: "var(--cyan)" }}>{parseRobloxTarget(linkDraft) || "(unparseable, sent as-is)"}</code>
              </div>
            )}
            <div className="modalfoot" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setLinkModalOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={confirmLink} disabled={savingPolicy}>
                {savingPolicy ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
