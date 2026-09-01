"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ───
interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
}

interface Account {
  sourceAccount: string;
  money: number | null;
  speed: number | null;
  incomeAktif: number | null;
  incomeEggBackpack: number | null;
  incomeEggSedangTumbuh: number | null;
  highValuePetTotal: number | null;
  kandangLevel: number | null;
  treadmillLevel: number | null;
  petsCount: number;
  stolenCount: number;
  topPets: Pet[];
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
  forSale?: boolean;
}

interface AccountDetail {
  activePets: Pet[];
  activeLimit: number | null;
  allPets: Pet[];
  growingEggs: Pet[];
  backpackEggs: Pet[];
}

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

interface AccountInfo {
  sourceAccount: string;
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
}

interface LogEntry {
  id: string;
  ts: number;
  action: string;
  packages: string[];
}

// ─── Helpers ───
function normalizePackage(p: string | TermuxPackage): TermuxPackage {
  return typeof p === "string" ? { pkg: p } : p;
}

function fmtMB(mb: number): string {
  return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB";
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function fmtUptime(firstSeen?: number): string {
  if (!firstSeen) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - firstSeen));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-US");
}

function fmtCompactNum(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T+";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B+";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M+";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K+";
  return n.toLocaleString("en-US");
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "-";
  return fmtMoney(v) + "/s";
}

function fmtLevel(v: number | null | undefined): string {
  if (v == null) return "-";
  return "Lv. " + v;
}

function fmtSession(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function deviceBlockStart(num: number | null): number | null {
  if (num === null || isNaN(num)) return null;
  return Math.floor((num - 1) / 10) * 10 + 1;
}

function deviceLabel(name: string): string | null {
  const start = deviceBlockStart(accountNumber(name));
  return start === null ? null : "SAE " + start;
}

// ─── Pet Icon helpers ───
let iconIndex: Record<string, string> | null = null;
let iconIndexPromise: Promise<Record<string, string>> | null = null;

function loadIconIndex(): Promise<Record<string, string>> {
  if (iconIndex) return Promise.resolve(iconIndex);
  if (!iconIndexPromise) {
    iconIndexPromise = fetch("/icons/index.json")
      .then((r) => r.json())
      .then((data) => { iconIndex = data; return data; })
      .catch(() => { iconIndex = {}; return {}; });
  }
  return iconIndexPromise;
}

function petIconUrl(category: string, index: Record<string, string>): string | null {
  const filename = index[category];
  return filename ? `/icons/normal/${encodeURIComponent(filename)}` : null;
}

function petRarity(category: string, index: Record<string, string>): string | null {
  const filename = index[category];
  if (!filename) return null;
  const m = filename.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}

const DIVINE_RARITIES = new Set(["Divine", "Eternal"]);
const ONE_BILLION = 1_000_000_000;

function pickHighlightPet(pets: Pet[], index: Record<string, string>): { highlight: Pet | null; main: Pet[] } {
  if (!pets || pets.length === 0) return { highlight: null, main: [] };
  const divineHighRate = pets
    .filter((p) => DIVINE_RARITIES.has(petRarity(p.category, index) || "") && (p.rate || 0) >= ONE_BILLION)
    .sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const highlight = divineHighRate.length > 0 ? divineHighRate[0] : [...pets].sort((a, b) => (b.rate || 0) - (a.rate || 0))[0];
  const main = pets.filter((p) => p !== highlight).slice(0, 3);
  return { highlight, main };
}

function rarityColor(rarity: string | null): string {
  switch (rarity) {
    case "Divine": return "#e879f9";
    case "Eternal": return "#f97316";
    case "Secret": return "#ef4444";
    case "Cosmic": return "#22d3ee";
    case "Mythic": return "#a78bfa";
    case "Legendary": return "#fbbf24";
    case "Epic": return "#818cf8";
    case "Rare": return "#34d399";
    default: return "#71717a";
  }
}

// ─── SVG Icons ───
function SvgIcon({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  monitor: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  accounts: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  poster: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  scanner: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  settingsInner: "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  back: "M15 19l-7-7 7-7",
};

// ─── Tab definitions ───
type Tab = "monitor" | "accounts" | "poster" | "scanner" | "settings";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "monitor", label: "Monitor", icon: ICONS.monitor },
  { id: "accounts", label: "Accounts", icon: ICONS.accounts },
  { id: "poster", label: "Poster", icon: ICONS.poster },
  { id: "scanner", label: "Scanner", icon: ICONS.scanner },
  { id: "settings", label: "Settings", icon: ICONS.settings },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("monitor");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        :root {
          --bg: #09090b;
          --card: #0f0f11;
          --card-hover: #18181b;
          --border: #27272a;
          --border-hover: #3f3f46;
          --ink: #fafafa;
          --ink-secondary: #a1a1aa;
          --ink-muted: #71717a;
          --yellow: #facc15;
          --yellow-dim: rgba(250,204,21,.15);
          --red: #ef4444;
          --red-dim: rgba(239,68,68,.15);
          --green: #22c55e;
          --green-dim: rgba(34,197,94,.15);
          --cyan: #22d3ee;
          --radius: 8px;
        }

        * { box-sizing: border-box; margin: 0; }
        body {
          background: var(--bg); color: var(--ink);
          font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        button, input, select { font: inherit; }
        button { cursor: pointer; }

        /* ─── Layout ─── */
        .db-wrap { padding: 24px 28px 60px; }

        /* ─── Header ─── */
        .db-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
        .db-logo {
          width: 40px; height: 40px; border-radius: 10px;
          background: var(--yellow); display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 15px; color: #09090b; flex-shrink: 0;
        }
        .db-brand { flex: 1; }
        .db-title { font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -.3px; }
        .db-subtitle { font-size: 12px; color: var(--ink-muted); font-weight: 500; margin-top: 1px; }
        .db-live {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--green-dim); color: var(--green); border: 1px solid rgba(34,197,94,.25);
          padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
        }
        .db-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }

        /* ─── Tabs ─── */
        .db-tabs {
          display: flex; gap: 2px; background: var(--card); border: 1px solid var(--border);
          border-radius: 10px; padding: 4px; margin-bottom: 24px; width: fit-content;
        }
        .db-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 7px; border: none; background: transparent;
          color: var(--ink-muted); font-size: 13px; font-weight: 600; transition: all .15s;
        }
        .db-tab:hover { color: var(--ink-secondary); background: var(--card-hover); }
        .db-tab.active { color: var(--ink); background: var(--bg); border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,.3); }

        /* ─── Stat cards ─── */
        .db-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .db-stat {
          background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 16px;
        }
        .db-stat .label { color: var(--ink-muted); font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
        .db-stat .value { font-size: 28px; font-weight: 800; margin-top: 6px; letter-spacing: -.5px; }
        .db-stat .sub { color: var(--ink-muted); font-size: 11px; margin-top: 2px; }
        .db-stat.yellow .value { color: var(--yellow); }
        .db-stat.red .value { color: var(--red); }
        .db-stat.green .value { color: var(--green); }
        .db-stat.cyan .value { color: var(--cyan); }

        /* ─── Toolbar ─── */
        .db-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .db-select {
          background: var(--card); color: var(--ink); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 8px 12px; font-size: 13px; font-weight: 500;
        }
        .db-select:focus { outline: none; border-color: var(--yellow); }
        .db-input {
          background: var(--card); color: var(--ink); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 8px 12px; font-size: 13px; font-weight: 500;
        }
        .db-input:focus { outline: none; border-color: var(--yellow); }
        .db-input::placeholder { color: var(--ink-muted); }

        /* ─── Pills ─── */
        .db-pills { display: flex; gap: 4px; }
        .db-pill {
          border: 1px solid var(--border); background: transparent; color: var(--ink-muted);
          padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
        }
        .db-pill:hover { border-color: var(--border-hover); color: var(--ink-secondary); }
        .db-pill.active { background: var(--yellow-dim); color: var(--yellow); border-color: rgba(250,204,21,.3); }

        /* ─── Buttons ─── */
        .btn-yellow {
          background: var(--yellow); color: #09090b; border: none; border-radius: var(--radius);
          padding: 8px 16px; font-size: 13px; font-weight: 700; transition: .15s;
        }
        .btn-yellow:hover { filter: brightness(1.05); }
        .btn-yellow:disabled { opacity: .5; cursor: not-allowed; }
        .btn-outline {
          background: transparent; color: var(--ink); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 8px 14px; font-size: 12px; font-weight: 600;
        }
        .btn-outline:hover { border-color: var(--border-hover); background: var(--card-hover); }
        .btn-outline:disabled { opacity: .35; cursor: not-allowed; }
        .btn-red {
          background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,.25);
          border-radius: var(--radius); padding: 8px 14px; font-size: 12px; font-weight: 600;
        }
        .btn-red:hover { background: rgba(239,68,68,.2); }

        /* ─── Grid layouts ─── */
        .db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        .db-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }

        /* ─── Device card ─── */
        .dev-card {
          background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 16px; cursor: pointer; transition: .15s;
        }
        .dev-card:hover { border-color: var(--border-hover); background: var(--card-hover); }
        .dev-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .dev-name { font-weight: 700; font-size: 15px; }
        .dev-host { color: var(--ink-muted); font-size: 11px; margin-top: 3px; }
        .dev-status { font-size: 10px; text-transform: uppercase; font-weight: 700; display: inline-flex; gap: 5px; align-items: center; }
        .dev-status.online { color: var(--green); }
        .dev-status.offline { color: var(--red); }

        .dev-metric { margin-top: 12px; }
        .dev-metric-row { display: flex; justify-content: space-between; color: var(--ink-muted); font-size: 11px; margin-bottom: 4px; }
        .dev-metric-row b { color: var(--ink); font-weight: 600; }
        .dev-bar { height: 4px; background: #27272a; border-radius: 99px; overflow: hidden; }
        .dev-fill { height: 100%; border-radius: 99px; background: var(--green); transition: width .3s; }
        .dev-fill.warn { background: var(--yellow); }
        .dev-fill.danger { background: var(--red); }
        .dev-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); color: var(--ink-muted); font-size: 11px; }
        .dev-pkg { color: var(--yellow); font-weight: 600; }

        /* ─── Account card ─── */
        .acc-card {
          background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 16px; cursor: pointer; transition: .15s;
        }
        .acc-card:hover { border-color: var(--border-hover); }
        .acc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .acc-dot { width: 8px; height: 8px; border-radius: 50%; }
        .acc-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .acc-name { font-weight: 700; font-size: 14px; }
        .acc-tag { color: var(--yellow); font-size: 10px; font-weight: 700; background: var(--yellow-dim); border-radius: 4px; padding: 2px 6px; }
        .acc-time { color: var(--ink-muted); font-size: 11px; margin-left: auto; }
        .acc-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px; }
        .acc-stat .label { color: var(--ink-muted); font-size: 10px; font-weight: 600; }
        .acc-stat .val { font-size: 14px; font-weight: 700; }
        .acc-stat.money .val { color: var(--yellow); }
        .acc-stat.speed .val { color: var(--cyan); }

        /* ─── Pet section in account card ─── */
        .pet-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .pet-hl {
          background: var(--card-hover); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 8px; display: flex; flex-direction: column;
          align-items: center; justify-content: center; min-width: 85px; text-align: center; gap: 3px;
        }
        .pet-badge { font-size: 8px; font-weight: 800; letter-spacing: .5px; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
        .pet-hl .pname { font-size: 10px; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75px; }
        .pet-hl .prate { font-size: 11px; font-weight: 700; }
        .pet-list { display: flex; gap: 5px; overflow-x: auto; flex: 1; }
        .pet-mini {
          background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px;
          padding: 5px 6px; text-align: center; min-width: 68px; display: flex; flex-direction: column;
          align-items: center; gap: 3px; flex: 1;
        }
        .pet-mini .pname { font-size: 9px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 58px; }
        .pet-mini .prate { font-size: 9px; color: var(--yellow); font-weight: 600; }

        /* ─── Device detail view ─── */
        .detail-back {
          border: none; background: none; color: var(--ink-muted); padding: 0;
          font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: center; gap: 4px;
        }
        .detail-back:hover { color: var(--ink); }
        .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .detail-two { display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; }
        .detail-panel {
          background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px;
        }
        .detail-panel h3 { font-size: 14px; font-weight: 700; margin: 0; }
        .detail-panel .muted { color: var(--ink-muted); font-size: 12px; }
        .detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .detail-table th { color: var(--ink-muted); font-size: 10px; text-transform: uppercase; text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
        .detail-table td { padding: 10px 8px; border-bottom: 1px solid #1c1c1e; }
        .detail-table tr:last-child td { border-bottom: 0; }
        .detail-badge { padding: 3px 7px; border-radius: 5px; font-size: 10px; font-weight: 700; white-space: nowrap; }
        .detail-badge.game { background: var(--green-dim); color: var(--green); }
        .detail-badge.off { background: var(--red-dim); color: var(--red); }
        .detail-badge.unk { background: rgba(113,113,122,.15); color: var(--ink-muted); }
        .detail-console {
          background: #09090b; border: 1px solid #1c1c1e; border-radius: 6px;
          padding: 10px; height: 200px; overflow: auto;
          font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
        }
        .detail-log { margin: 0 0 8px; }
        .detail-log .time { color: #52525b; }
        .detail-log .cmd { color: var(--yellow); }

        /* ─── Modal ─── */
        .db-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex;
          align-items: flex-start; justify-content: center; padding: 40px 16px;
          overflow-y: auto; z-index: 50;
        }
        .db-modal {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 24px; width: 100%; max-width: 720px;
        }
        .db-modal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .db-modal-head .name { font-size: 18px; font-weight: 800; }
        .db-modal-close { margin-left: auto; background: none; border: none; color: var(--ink-muted); font-size: 20px; cursor: pointer; }
        .db-modal-close:hover { color: var(--ink); }
        .db-modal-sub { color: var(--ink-muted); font-size: 12px; margin-bottom: 16px; }
        .db-section-title { color: var(--yellow); font-size: 12px; font-weight: 700; letter-spacing: .5px; margin: 16px 0 8px; text-transform: uppercase; }
        .db-detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
        .db-dpet {
          background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px;
          padding: 6px 8px; display: flex; align-items: center; gap: 8px;
        }
        .db-dpet .dname { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .db-dpet .drate { font-size: 11px; color: var(--yellow); font-weight: 600; }

        /* ─── Grid modal ─── */
        .grid-modal {
          width: min(700px, 92vw); background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 20px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
          max-height: 90vh; overflow-y: auto;
        }
        .grid-modal h2 { font-size: 16px; font-weight: 700; margin: 0 0 6px; }
        .grid-preview-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 16px; font-size: 10px; letter-spacing: .06em; color: var(--ink-muted); }
        .grid-preview-dims { color: var(--yellow); font-weight: 700; }
        .grid-cells { display: grid; gap: 6px; margin: 8px auto 16px; max-width: 100%; }
        .grid-cell {
          background: #18181b; border: 1px solid #27272a; border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; color: var(--ink-muted); padding: 4px; text-align: center;
        }
        .grid-cell.filled { border-color: var(--yellow); color: var(--yellow); background: var(--yellow-dim); font-weight: 700; }
        .grid-selects { display: flex; gap: 8px; align-items: center; }
        .grid-selects select {
          background: var(--bg); color: var(--ink); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 7px;
        }
        .grid-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

        /* ─── Empty state ─── */
        .db-empty { color: var(--ink-muted); text-align: center; padding: 60px 0; font-size: 14px; }

        /* ─── Toast ─── */
        .db-toast {
          position: fixed; right: 20px; bottom: 20px; background: #18181b; border: 1px solid var(--border);
          padding: 10px 14px; border-radius: var(--radius); z-index: 100; box-shadow: 0 12px 40px rgba(0,0,0,.5);
          font-size: 13px; font-weight: 500;
        }

        /* ─── Responsive ─── */
        @media (max-width: 1000px) {
          .db-stats { grid-template-columns: repeat(2, 1fr); }
          .detail-two { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .db-tabs { width: 100%; overflow-x: auto; }
          .db-tab { padding: 8px 10px; font-size: 12px; }
        }
      `}</style>

      <div className="db-wrap">
        <div className="db-header">
          <div className="db-logo">NH</div>
          <div className="db-brand">
            <div className="db-title">NaruHub</div>
            <div className="db-subtitle">Steal An Egg — Control Dashboard</div>
          </div>
          <span className="db-live"><span className="db-dot" /> LIVE</span>
        </div>

        <div className="db-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`db-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <SvgIcon d={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "monitor" && <MonitorTab showToast={setToast} />}
        {tab === "accounts" && <AccountsTab showToast={setToast} />}
        {tab === "poster" && <PlaceholderTab name="Poster" desc="Generate and manage account posters for Discord." />}
        {tab === "scanner" && <PlaceholderTab name="Scanner" desc="Scan and discover accounts automatically." />}
        {tab === "settings" && <PlaceholderTab name="Settings" desc="Configure dashboard and agent settings." />}
      </div>

      {toast && <div className="db-toast">{toast}</div>}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MONITOR TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MonitorTab({ showToast }: { showToast: (s: string) => void }) {
  const [devices, setDevices] = useState<TermuxDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

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
      showToast("Rename saved");
    } catch {
      showToast("Gagal rename");
    }
  }

  function displayName(d: TermuxDevice) {
    return d.customName || d.hostname;
  }

  function fillClass(v: number) {
    return v >= 85 ? "danger" : v >= 70 ? "warn" : "";
  }

  const onlineDevices = devices.filter((d) => d.status === "online");
  const offlineDevices = devices.filter((d) => d.status !== "online");
  const totalPackages = devices.reduce((a, d) => a + d.packages.length, 0);
  const visible = devices.filter((d) => filter === "all" || d.status === filter);

  if (selectedDevice) {
    return (
      <DeviceDetail
        deviceId={selectedDevice}
        devices={devices}
        onBack={() => setSelectedDevice(null)}
        showToast={showToast}
        fetchDevices={fetchDevices}
      />
    );
  }

  return (
    <>
      <div className="db-stats">
        <div className="db-stat cyan">
          <div className="label">DEVICES</div>
          <div className="value">{devices.length}</div>
          <div className="sub">{onlineDevices.length} online</div>
        </div>
        <div className="db-stat green">
          <div className="label">ONLINE</div>
          <div className="value">{onlineDevices.length}</div>
        </div>
        <div className="db-stat red">
          <div className="label">OFFLINE</div>
          <div className="value">{offlineDevices.length}</div>
        </div>
        <div className="db-stat">
          <div className="label">ROBLOX PACKAGES</div>
          <div className="value">{totalPackages}</div>
        </div>
        <div className="db-stat yellow">
          <div className="label">POLLING</div>
          <div className="value">10s</div>
          <div className="sub">HTTP fetch</div>
        </div>
      </div>

      <div className="db-toolbar">
        <div className="db-pills">
          {(["all", "online", "offline"] as const).map((x) => (
            <button key={x} className={`db-pill ${filter === x ? "active" : ""}`} onClick={() => setFilter(x)}>
              {x[0].toUpperCase() + x.slice(1)} ({x === "all" ? devices.length : x === "online" ? onlineDevices.length : offlineDevices.length})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="db-empty">Memuat devices...</div>
      ) : devices.length === 0 ? (
        <div className="db-empty">Belum ada device terhubung.</div>
      ) : (
        <div className="db-grid">
          {visible.map((d) => {
            const ram = pctUsed(d.stats?.ram);
            const storage = pctStorageUsed(d.stats?.storage);
            const cpu = d.stats?.load ? Math.min(100, Math.round((d.stats.load["1m"] / 8) * 100)) : 0;
            const isRenaming = renamingId === d.deviceId;

            return (
              <div key={d.deviceId} className="dev-card" onClick={() => !isRenaming && setSelectedDevice(d.deviceId)}>
                <div className="dev-head">
                  <div>
                    {isRenaming ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          className="db-input"
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveRename(d.deviceId)}
                          style={{ width: 160 }}
                        />
                        <button className="btn-outline" onClick={() => saveRename(d.deviceId)} style={{ padding: "6px 10px" }}>Save</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div className="dev-name">{displayName(d)}</div>
                        <button
                          className="btn-outline"
                          style={{ padding: "2px 6px", fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); setRenamingId(d.deviceId); setRenameDraft(displayName(d)); }}
                        >Rename</button>
                      </div>
                    )}
                    <div className="dev-host">{d.hostname} &bull; {d.platform}</div>
                  </div>
                  <div className={`dev-status ${d.status === "online" ? "online" : "offline"}`}>
                    <span className="db-dot" /> {d.status.toUpperCase()}
                  </div>
                </div>

                {d.stats?.ram && (
                  <div className="dev-metric">
                    <div className="dev-metric-row"><span>RAM</span><b>{fmtMB(d.stats.ram.usedMB)} / {fmtMB(d.stats.ram.totalMB)} &middot; {ram}%</b></div>
                    <div className="dev-bar"><div className={`dev-fill ${fillClass(ram)}`} style={{ width: `${ram}%` }} /></div>
                  </div>
                )}
                {d.stats?.load && (
                  <div className="dev-metric">
                    <div className="dev-metric-row"><span>CPU LOAD</span><b>{d.stats.load["1m"].toFixed(1)} &middot; {cpu}%</b></div>
                    <div className="dev-bar"><div className={`dev-fill ${fillClass(cpu)}`} style={{ width: `${cpu}%` }} /></div>
                  </div>
                )}
                {d.stats?.storage && (
                  <div className="dev-metric">
                    <div className="dev-metric-row"><span>STORAGE</span><b>{fmtMB(d.stats.storage.freeMB)} free &middot; {storage}%</b></div>
                    <div className="dev-bar"><div className={`dev-fill ${fillClass(storage)}`} style={{ width: `${storage}%` }} /></div>
                  </div>
                )}

                <div className="dev-foot">
                  <span className="dev-pkg">{d.packages.length} package{d.packages.length !== 1 ? "s" : ""}</span>
                  <span>Updated {ago(d.lastSeen)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEVICE DETAIL (inline in monitor tab)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DeviceDetail({
  deviceId,
  devices: initialDevices,
  onBack,
  showToast,
  fetchDevices: parentFetch,
}: {
  deviceId: string;
  devices: TermuxDevice[];
  onBack: () => void;
  showToast: (s: string) => void;
  fetchDevices: () => Promise<void>;
}) {
  const [device, setDevice] = useState<TermuxDevice | null>(initialDevices.find((d) => d.deviceId === deviceId) || null);
  const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
  const [consoleLog, setConsoleLog] = useState<LogEntry[]>([]);
  const [layout, setLayout] = useState<{ cols: number; rows: number }>({ cols: 4, rows: 3 });
  const [draftLayout, setDraftLayout] = useState<{ cols: number; rows: number }>({ cols: 4, rows: 3 });
  const [launchDelay, setLaunchDelay] = useState(5);
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [launchingBatch, setLaunchingBatch] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const fetchDetail = useCallback(async () => {
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
      setConsoleLog((logData.entries || []).slice().reverse());
    } catch {}
  }, [deviceId]);

  useEffect(() => {
    fetchDetail();
    const id = setInterval(fetchDetail, 10000);
    return () => clearInterval(id);
  }, [fetchDetail]);

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
  }, [device?.packages]);

  function displayName(d: TermuxDevice) { return d.customName || d.hostname; }

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
      showToast("Rename saved");
    } catch {
      showToast("Gagal rename");
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
        body: JSON.stringify({ deviceId, packageNames: list.map((p) => p.pkg), cols: g.cols, rows: g.rows, resize, launchDelay }),
      });
      const data = await res.json();
      showToast(data.ok ? (resize ? `Grid applied: ${list.length} packages` : `Launch queued: ${list.length} packages`) : `Gagal: ${data.error}`);
      if (data.ok) fetchDetail();
    } catch (e: any) {
      showToast("Gagal: " + e.message);
    }
    setLaunchingBatch(false);
  }

  function autoGridDims(n: number) {
    if (n <= 0) return { cols: 1, rows: 1 };
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    return { cols, rows };
  }

  function autoGridAndApply() {
    if (selectedPkgs.length === 0) { showToast("Pilih package dulu"); return; }
    const dims = autoGridDims(selectedPkgs.length);
    if (!window.confirm(`Auto grid ${dims.cols}x${dims.rows} untuk ${selectedPkgs.length} package. Lanjut?`)) return;
    setLayout(dims);
    setDraftLayout(dims);
    launchMany(selectedPkgs, true, dims);
  }

  function applyGridToDevice() {
    if (selectedPkgs.length === 0) { showToast("Pilih package dulu"); return; }
    if (!window.confirm(`Terapkan grid ${draftLayout.cols}x${draftLayout.rows}? ${selectedPkgs.length} packages akan di-launch + resize.`)) return;
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

  if (!device) {
    return (
      <>
        <button className="detail-back" onClick={onBack}>
          <SvgIcon d={ICONS.back} size={14} /> Back to devices
        </button>
        <div className="db-empty">Device tidak ditemukan atau sudah offline lama.</div>
      </>
    );
  }

  const ram = pctUsed(device.stats?.ram);
  const storage = pctStorageUsed(device.stats?.storage);

  return (
    <>
      <button className="detail-back" onClick={onBack}>
        <SvgIcon d={ICONS.back} size={14} /> Back to devices
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          {renaming ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="db-input" autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveRename()} style={{ fontSize: 20, width: 250 }} />
              <button className="btn-outline" onClick={saveRename}>Save</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>{displayName(device)}</h2>
              <button className="btn-outline" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { setRenaming(true); setRenameDraft(displayName(device)); }}>Rename</button>
            </div>
          )}
          <div style={{ color: "var(--ink-muted)", fontSize: 12, marginTop: 4 }}>
            {device.hostname} &bull; Android/Termux &bull; HWID {device.deviceId.slice(0, 8)}&hellip; &bull; Updated {ago(device.lastSeen)}
          </div>
        </div>
        <div className="detail-actions">
          <span className={`db-live ${device.status !== "online" ? "" : ""}`} style={device.status !== "online" ? { background: "var(--red-dim)", color: "var(--red)", borderColor: "rgba(239,68,68,.25)" } : {}}>
            <span className="db-dot" /> {device.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="db-stats">
        {device.stats?.battery && device.stats.battery.percent != null && (
          <div className={`db-stat ${device.stats.battery.percent < 20 ? "red" : "green"}`}>
            <div className="label">BATTERY</div>
            <div className="value">{device.stats.battery.percent}%</div>
            <div className="sub">{device.stats.battery.charging ? "Charging" : "Not charging"}</div>
          </div>
        )}
        {device.stats?.ram && (
          <div className={`db-stat ${ram >= 85 ? "red" : "cyan"}`}>
            <div className="label">RAM</div>
            <div className="value">{fmtMB(device.stats.ram.usedMB)} / {fmtMB(device.stats.ram.totalMB)}</div>
            <div className="sub">{ram}% used</div>
          </div>
        )}
        {device.stats?.storage && (
          <div className="db-stat yellow">
            <div className="label">STORAGE</div>
            <div className="value">{fmtMB(device.stats.storage.freeMB)} free</div>
            <div className="sub">{storage}% used</div>
          </div>
        )}
        {device.stats?.load && (
          <div className="db-stat green">
            <div className="label">CPU LOAD</div>
            <div className="value">{device.stats.load["1m"].toFixed(2)}</div>
            <div className="sub">1 minute load</div>
          </div>
        )}
        {device.screen && (
          <div className="db-stat cyan">
            <div className="label">SCREEN</div>
            <div className="value">{device.screen.width} x {device.screen.height}</div>
          </div>
        )}
      </div>

      <div className="detail-two">
        <section className="detail-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3>Roblox Packages</h3>
            <span className="muted">{pkgs.length} detected</span>
          </div>
          {pkgs.length === 0 ? (
            <div className="db-empty">Belum ada package terdeteksi.</div>
          ) : (
            <>
              <table className="detail-table">
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
                        <td><input type="checkbox" checked={selected[p.pkg] !== false} onChange={(e) => setSelected((prev) => ({ ...prev, [p.pkg]: e.target.checked }))} /></td>
                        <td>{p.pkg}</td>
                        <td>{p.username || <span style={{ color: "var(--ink-muted)", fontStyle: "italic" }}>belum terdeteksi</span>}</td>
                        <td>{sessionSecs != null ? fmtSession(sessionSecs) : "—"}</td>
                        <td>
                          {p.username ? (
                            <span className={`detail-badge ${acc?.online ? "game" : "off"}`}>{acc?.online ? "IN GAME" : "DISCONNECTED"}</span>
                          ) : (
                            <span className="detail-badge unk">UNKNOWN</span>
                          )}
                        </td>
                        <td>
                          <button className="btn-outline" style={{ padding: "5px 10px", fontSize: 11 }} disabled={launchingBatch || device.status !== "online"} onClick={() => launchMany([p])}>Open</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 12 }}>
                <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>Batch launch</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-outline" disabled={selectedPkgs.length === 0 || launchingBatch || device.status !== "online"} onClick={autoGridAndApply}>
                    {launchingBatch ? "Sending..." : `Auto Grid (${selectedPkgs.length})`}
                  </button>
                  <button className="btn-yellow" disabled={selectedPkgs.length === 0 || launchingBatch || device.status !== "online"} onClick={() => launchMany(selectedPkgs)}>
                    {launchingBatch ? "Sending..." : `Launch (${selectedPkgs.length})`}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="detail-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3>Command Console</h3>
            <span className="muted">launch history</span>
          </div>
          <div className="detail-console">
            {consoleLog.length === 0 ? (
              <div className="detail-log" style={{ color: "var(--ink-muted)" }}>Belum ada command yang dikirim.</div>
            ) : (
              consoleLog.map((entry) => (
                <div key={entry.id} className="detail-log">
                  <span className="time">{fmtClock(entry.ts)}</span>{" "}
                  <span className="cmd">{entry.action}</span> → {entry.packages.join(", ")}
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn-outline" onClick={() => { setDraftLayout(selectedPkgs.length > 0 ? autoGridDims(selectedPkgs.length) : layout); setGridModalOpen(true); }}>
              Grid Layout Config
            </button>
          </div>
        </section>
      </div>

      {gridModalOpen && (
        <div className="db-overlay" onClick={() => setGridModalOpen(false)}>
          <div className="grid-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Grid Layout Configuration</h2>
            <div style={{ color: "var(--ink-muted)", fontSize: 12 }}>
              Auto-suggested from {selectedPkgs.length} checked packages. Override below.
            </div>
            <div className="grid-preview-head">
              <span>LAYOUT PREVIEW</span>
              <span className="grid-preview-dims">
                {draftLayout.rows} ROWS x {draftLayout.cols} COLUMNS ({draftLayout.rows * draftLayout.cols} SLOTS)
              </span>
            </div>
            {(() => {
              const sw = device.screen?.width || 1920;
              const sh = device.screen?.height || 1080;
              const maxW = 620;
              const maxH = 380;
              const scale = Math.min(maxW / sw, maxH / sh);
              const previewW = Math.round(sw * scale);
              const previewH = Math.round(sh * scale);
              return (
                <div className="grid-cells" style={{ gridTemplateColumns: `repeat(${draftLayout.cols}, 1fr)`, gridTemplateRows: `repeat(${draftLayout.rows}, 1fr)`, width: previewW, height: previewH }}>
                  {Array.from({ length: draftLayout.cols * draftLayout.rows }).map((_, slot) => (
                    <div key={slot} className={`grid-cell ${slot < selectedPkgs.length ? "filled" : ""}`}>#{slot + 1}</div>
                  ))}
                </div>
              );
            })()}
            <div className="grid-selects">
              <select value={draftLayout.cols} onChange={(e) => setDraftLayout((l) => ({ ...l, cols: Number(e.target.value) }))}>
                {Array.from({ length: 8 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} columns</option>)}
              </select>
              <select value={draftLayout.rows} onChange={(e) => setDraftLayout((l) => ({ ...l, rows: Number(e.target.value) }))}>
                {Array.from({ length: 8 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} rows</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-muted)", fontSize: 13 }}>
                Delay
                <input className="db-input" type="number" min={0} max={120} value={launchDelay} onChange={(e) => setLaunchDelay(Math.max(0, Number(e.target.value)))} style={{ width: 54, textAlign: "center" }} />
                sec
              </label>
            </div>
            <div className="grid-foot">
              <button className="btn-outline" onClick={() => setGridModalOpen(false)}>Close</button>
              <button className="btn-outline" onClick={() => { setLayout(draftLayout); setGridModalOpen(false); showToast("Preview saved locally"); }}>Save preview</button>
              <button className="btn-yellow" disabled={launchingBatch || device.status !== "online"} onClick={applyGridToDevice}>Apply to device</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACCOUNTS TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AccountsTab({ showToast }: { showToast: (s: string) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState("name_asc");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [detail, setDetail] = useState<{ name: string; data: AccountDetail | null; loading: boolean } | null>(null);
  const [genAllStatus, setGenAllStatus] = useState("");
  const [genAllRunning, setGenAllRunning] = useState(false);
  const genMsgs = useRef<Record<string, { text: string; color: string }>>({});
  const [, forceUpdate] = useState(0);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      const active = (data.accounts || []).filter((a: Account) => a.online && !a.forSale);
      setAccounts(active);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
    const id = setInterval(fetchAccounts, 5000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  function filterByDevice(list: Account[]): Account[] {
    if (!deviceFilter.trim()) return list;
    const queryNum = accountNumber(deviceFilter.trim());
    if (queryNum === null) return list;
    const wantBlock = deviceBlockStart(queryNum);
    return list.filter((a) => deviceBlockStart(accountNumber(a.sourceAccount)) === wantBlock);
  }

  function sortAccounts(list: Account[]): Account[] {
    const sorted = [...list];
    switch (sortMode) {
      case "speed_desc": sorted.sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0)); break;
      case "income_aktif_desc": sorted.sort((a, b) => (Number(b.incomeAktif) || 0) - (Number(a.incomeAktif) || 0)); break;
      case "income_pasif_desc": sorted.sort((a, b) => ((Number(b.incomeEggBackpack) || 0) + (Number(b.incomeEggSedangTumbuh) || 0)) - ((Number(a.incomeEggBackpack) || 0) + (Number(a.incomeEggSedangTumbuh) || 0))); break;
      case "egg_desc": sorted.sort((a, b) => (Number(b.stolenCount) || 0) - (Number(a.stolenCount) || 0)); break;
      default:
        sorted.sort((a, b) => {
          const na = accountNumber(a.sourceAccount);
          const nb = accountNumber(b.sourceAccount);
          if (na !== null && nb !== null && na !== nb) return na - nb;
          return a.sourceAccount.localeCompare(b.sourceAccount);
        });
    }
    return sorted;
  }

  const visible = sortAccounts(filterByDevice(accounts));

  const totalMoney = visible.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalSpeed = visible.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = visible.reduce((s, a) => s + (Number(a.petsCount) || 0), 0);
  const totalStolen = visible.reduce((s, a) => s + (Number(a.stolenCount) || 0), 0);

  async function openDetail(name: string) {
    setDetail({ name, data: null, loading: true });
    try {
      const res = await fetch("/api/account-detail?account=" + encodeURIComponent(name));
      const body = await res.json();
      if (res.ok && body.ok) setDetail({ name, data: body, loading: false });
      else setDetail({ name, data: null, loading: false });
    } catch { setDetail({ name, data: null, loading: false }); }
  }

  function setGenMsg(account: string, text: string, color: string) {
    genMsgs.current[account] = { text, color };
    forceUpdate((n) => n + 1);
  }

  async function generatePoster(account: string) {
    setGenMsg(account, "Mengirim...", "var(--ink-muted)");
    try {
      const res = await fetch("/api/generate-poster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) });
      const body = await res.json();
      if (res.ok && body.ok) {
        setGenMsg(account, body.mode === "discord-price-flow" ? "Draft terkirim ke Discord." : "Poster terkirim ke Discord.", "var(--green)");
      } else {
        setGenMsg(account, "Gagal: " + (body.error || "unknown"), "var(--red)");
      }
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "var(--red)");
    }
  }

  async function markForSale(account: string) {
    setGenMsg(account, "Memindahkan ke katalog...", "var(--ink-muted)");
    try {
      const res = await fetch("/api/mark-forsale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account, forSale: true }) });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
        setGenMsg(account, "Akun dipindah ke Katalog.", "var(--green)");
      } else {
        setGenMsg(account, "Gagal: " + (body.error || "unknown"), "var(--red)");
      }
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "var(--red)");
    }
  }

  async function generateAll() {
    if (genAllRunning || visible.length === 0) return;
    setGenAllRunning(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < visible.length; i++) {
      const acc = visible[i].sourceAccount;
      setGenAllStatus(`Generate ${i + 1}/${visible.length}: ${acc}...`);
      try {
        const res = await fetch("/api/generate-poster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: acc }) });
        const body = await res.json();
        if (res.ok && body.ok) ok++; else fail++;
      } catch { fail++; }
      if (i < visible.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    setGenAllStatus(`Selesai: ${ok} berhasil${fail ? `, ${fail} gagal` : ""}.`);
    setGenAllRunning(false);
  }

  return (
    <>
      <div className="db-stats">
        <div className="db-stat">
          <div className="label">ACTIVE ACCOUNTS</div>
          <div className="value">{visible.length}</div>
        </div>
        <div className="db-stat yellow">
          <div className="label">TOTAL MONEY</div>
          <div className="value">{fmtMoney(totalMoney)}</div>
        </div>
        <div className="db-stat cyan">
          <div className="label">TOTAL SPEED</div>
          <div className="value">{fmtCompactNum(totalSpeed)}</div>
        </div>
        <div className="db-stat">
          <div className="label">TOTAL PETS</div>
          <div className="value">{fmtNum(totalPets)}</div>
        </div>
        <div className="db-stat green">
          <div className="label">EGGS STOLEN</div>
          <div className="value">{fmtNum(totalStolen)}</div>
        </div>
      </div>

      <div className="db-toolbar">
        <select className="db-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
          <option value="name_asc">Nama Akun (Nomor)</option>
          <option value="speed_desc">Speed (Tertinggi)</option>
          <option value="income_aktif_desc">Income Potensi Pet Aktif</option>
          <option value="income_pasif_desc">Income Pasif</option>
          <option value="egg_desc">Egg Terbanyak</option>
        </select>
        <input className="db-input" type="text" placeholder="Filter device: mis 21" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} style={{ width: 160 }} />
        <div style={{ flex: 1 }} />
        <button className="btn-yellow" disabled={genAllRunning || visible.length === 0} onClick={generateAll}>Generate All Poster</button>
        {genAllStatus && <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{genAllStatus}</span>}
      </div>

      {visible.length === 0 ? (
        <div className="db-empty">
          {accounts.length > 0
            ? "Ga ada akun yang cocok sama filter device itu."
            : "Belum ada akun yang lapor. Nyalain Auto Report di GUI game."}
        </div>
      ) : (
        <div className="db-card-grid">
          {visible.map((a) => (
            <div key={a.sourceAccount} className="acc-card" onClick={() => openDetail(a.sourceAccount)}>
              <div className="acc-head">
                <span className={`acc-dot ${a.online ? "on" : ""}`} />
                <span className="acc-name">{a.sourceAccount}</span>
                {deviceLabel(a.sourceAccount) && <span className="acc-tag">{deviceLabel(a.sourceAccount)}</span>}
                <span className="acc-time">{a.online ? fmtUptime(a.firstSeen) || "Active" : "Offline"}</span>
              </div>
              <div className="acc-stats">
                <div className="acc-stat speed"><div className="label">SPEED</div><div className="val">{fmtCompactNum(a.speed)}</div></div>
                <div className="acc-stat money"><div className="label">CASH</div><div className="val">{fmtMoney(a.money)}</div></div>
                <div className="acc-stat"><div className="label">INCOME AKTIF</div><div className="val">{fmtRate(a.incomeAktif)}</div></div>
                <div className="acc-stat"><div className="label">PET &gt;= 1B/S</div><div className="val">{fmtRate(a.highValuePetTotal)}</div></div>
                <div className="acc-stat"><div className="label">KANDANG</div><div className="val">{fmtLevel(a.kandangLevel)}</div></div>
                <div className="acc-stat"><div className="label">TREADMILL</div><div className="val">{fmtLevel(a.treadmillLevel)}</div></div>
                <div className="acc-stat"><div className="label">PETS</div><div className="val">{fmtNum(a.petsCount)}</div></div>
                <div className="acc-stat"><div className="label">STOLEN</div><div className="val">{fmtNum(a.stolenCount)}</div></div>
              </div>
              <PetCards pets={a.topPets || []} />
              <a
                className="btn-yellow"
                href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`}
                onClick={(e) => e.stopPropagation()}
                style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 10 }}
              >
                Generate Poster
              </a>
              <button className="btn-red" onClick={(e) => { e.stopPropagation(); markForSale(a.sourceAccount); }} style={{ width: "100%", marginTop: 6 }}>
                Siap Jual
              </button>
              <div style={{ fontSize: 11, marginTop: 5, minHeight: 14, color: genMsgs.current[a.sourceAccount]?.color || "var(--ink-muted)" }}>
                {genMsgs.current[a.sourceAccount]?.text || ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="db-overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("db-overlay")) setDetail(null); }}>
          <div className="db-modal">
            <div className="db-modal-head">
              <span className="name">{detail.name}</span>
              <button className="db-modal-close" onClick={() => setDetail(null)}>&times;</button>
            </div>
            {detail.loading ? (
              <div className="db-modal-sub">Memuat...</div>
            ) : !detail.data ? (
              <div className="db-modal-sub">Belum ada data lengkap buat akun ini.</div>
            ) : (
              <>
                <div className="db-modal-sub">Active Limit: {detail.data.activeLimit ?? "-"}</div>
                <PetDetailSection title="Pet Aktif" pets={detail.data.activePets} />
                <PetDetailSection title="Isi Tas (Semua Pet)" pets={detail.data.allPets} />
                <PetDetailSection title="Telur Sedang Tumbuh" pets={detail.data.growingEggs} />
                <PetDetailSection title="Telur di Tas" pets={detail.data.backpackEggs} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Pet components ───
function PetIcon({ category, name, size = 32 }: { category: string; name: string; size?: number }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);

  const staticSrc = petIconUrl(category, index);
  const fallbackSrc = `/api/pet-icon?category=${encodeURIComponent(category)}`;
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSrc(staticSrc); setFailed(false); }, [staticSrc]);

  if (!src || failed) {
    if (!staticSrc && !failed && category) {
      return <img src={fallbackSrc} alt={name} width={size} height={size} style={{ borderRadius: 6, objectFit: "contain", background: "#18181b", flexShrink: 0 }} onError={() => setFailed(true)} />;
    }
    return (
      <div style={{ width: size, height: size, borderRadius: 6, background: "#27272a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, color: "var(--ink-muted)", flexShrink: 0 }}>
        {(name || "?")[0]}
      </div>
    );
  }
  return (
    <img
      src={src} alt={name} width={size} height={size}
      style={{ borderRadius: 6, objectFit: "contain", background: "#18181b", flexShrink: 0 }}
      onError={() => { if (staticSrc && !failed) setSrc(fallbackSrc); else setFailed(true); }}
    />
  );
}

function PetCards({ pets }: { pets: Pet[] }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);

  if (!pets || pets.length === 0) return null;

  const { highlight, main } = pickHighlightPet(pets, index);
  const hlRarity = highlight ? petRarity(highlight.category, index) : null;
  const hlColor = rarityColor(hlRarity);

  return (
    <div className="pet-row">
      {highlight && (
        <div className="pet-hl" style={{ borderColor: hlColor + "33" }}>
          <span className="pet-badge" style={{ background: hlColor + "22", color: hlColor }}>{hlRarity || "TOP"}</span>
          <PetIcon category={highlight.category} name={highlight.name || highlight.category} size={36} />
          <div className="pname">{highlight.name || highlight.category}</div>
          <div className="prate" style={{ color: hlColor }}>{fmtRate(highlight.rate)}</div>
        </div>
      )}
      <div className="pet-list">
        {main.map((p, i) => (
          <div key={i} className="pet-mini">
            <PetIcon category={p.category} name={p.name || p.category} />
            <div className="pname">{p.name || p.category}</div>
            <div className="prate">{fmtRate(p.rate)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PetDetailSection({ title, pets }: { title: string; pets: Pet[] }) {
  const sorted = [...(pets || [])].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  return (
    <>
      <div className="db-section-title">{title} ({sorted.length})</div>
      {sorted.length === 0 ? (
        <div style={{ color: "var(--ink-muted)", fontSize: 12 }}>Kosong.</div>
      ) : (
        <div className="db-detail-grid">
          {sorted.map((p, i) => (
            <div key={i} className="db-dpet">
              <PetIcon category={p.category} name={p.name || p.category} size={28} />
              <div>
                <div className="dname">
                  {p.name || p.category}
                  {(p.mutations || []).length > 0 && ` (${p.mutations!.join(", ")})`}
                </div>
                <div className="drate">{fmtRate(p.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Placeholder tab ───
function PlaceholderTab({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="db-empty">
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{name}</div>
      <div>{desc}</div>
      <div style={{ marginTop: 8, color: "var(--yellow)", fontSize: 13 }}>Coming soon</div>
    </div>
  );
}
