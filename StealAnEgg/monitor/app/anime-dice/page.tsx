"use client";

import { useEffect, useState, useCallback } from "react";

interface Unit {
  name: string;
  rarity: string;
  variant: string | null;
  mutation: string | null;
  level: number | null;
  amount: number;
}

interface ADAccount {
  sourceAccount: string;
  money: number | null;
  rolls: number | null;
  rebirth: number | null;
  dice: string | null;
  autoRoll: boolean | null;
  autoSell: number | null;
  vip: boolean;
  unitsCount: number;
  unitTypesCount: number;
  discoveredCount: number;
  slotsCount: number;
  ownedDiceCount: number;
  gamepasses: Record<string, boolean>;
  topUnits: Unit[];
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
  forSale?: boolean;
}

interface ADDetail {
  ownedDice: string[];
  upgrades: Record<string, number>;
  gamepasses: Record<string, boolean>;
  topUnits: Unit[];
  unitsCount: number;
  unitTypesCount: number;
  discoveredCount: number;
  slotsCount: number;
}

const RARITY_COLORS: Record<string, string> = {
  Exclusive: "#ff6b6b",
  "Secret II": "#ff4ecf",
  Heavenly: "#ff4ecf",
  "Secret I": "#ff7eb3",
  Celestial: "#ff7eb3",
  Exotic: "#f472b6",
  Divine: "#e879f9",
  Mythical: "#a78bfa",
  Legendary: "#fbbf24",
  Epic: "#818cf8",
  Rare: "#34d399",
  Uncommon: "#94a3b8",
  Common: "#71717a",
};

function rarityColor(r: string): string { return RARITY_COLORS[r] || "#71717a"; }

const DICE_COLORS: Record<string, string> = {
  Titan: "#f59e0b", Void: "#7c3aed", Solar: "#facc15", "Blood Moon": "#dc2626",
  Lunar: "#818cf8", Galaxy: "#a855f7", Prismatic: "#ec4899", Dragon: "#ef4444",
  Shadow: "#6b7280", Storm: "#38bdf8", Arcane: "#8b5cf6", Ice: "#67e8f9",
  Fire: "#f97316", Lightning: "#fde68a", Magma: "#ef4444", Nature: "#22c55e",
  Light: "#fef08a", "Black Hole": "#4b5563", Corrupted: "#a855f7", Royal: "#eab308",
  Water: "#3b82f6", Normal: "#6b7280",
};
function diceColor(d: string): string { return DICE_COLORS[d] || "#818cf8"; }

const MUTATION_STYLES: Record<string, { bg: string; color: string }> = {
  Diamond: { bg: "linear-gradient(135deg, #67e8f9, #22d3ee)", color: "#0c4a6e" },
  Gold: { bg: "linear-gradient(135deg, #fde68a, #f59e0b)", color: "#7c4a03" },
  Silver: { bg: "linear-gradient(135deg, #e5e7eb, #9ca3af)", color: "#374151" },
  Ruby: { bg: "linear-gradient(135deg, #fca5a5, #ef4444)", color: "#fff" },
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e30) return (n / 1e30).toFixed(2) + "no";
  if (abs >= 1e27) return (n / 1e27).toFixed(2) + "oc";
  if (abs >= 1e24) return (n / 1e24).toFixed(2) + "sp";
  if (abs >= 1e21) return (n / 1e21).toFixed(2) + "sx";
  if (abs >= 1e18) return (n / 1e18).toFixed(2) + "qi";
  if (abs >= 1e15) return (n / 1e15).toFixed(2) + "qa";
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(0);
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-US");
}

function fmtLastSeen(lastSeen?: number): string {
  if (!lastSeen) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - lastSeen));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

type TabMode = "all" | "online" | "offline";
type DetailTab = "units" | "upgrades" | "dice" | "backpack";

export default function AnimeDicePage() {
  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<ADAccount[]>([]);
  const [sortMode, setSortMode] = useState("default");
  const [tabMode, setTabMode] = useState<TabMode>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<{ name: string; data: ADDetail | null; loading: boolean; account: ADAccount | null } | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("units");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/anime-dice/accounts");
      const data = await res.json();
      setAccounts((data.accounts || []).filter((a: ADAccount) => !a.forSale));
    } catch {}
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchAccounts();
    const id = setInterval(fetchAccounts, 5000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  function sortAccounts(list: ADAccount[]): ADAccount[] {
    const sorted = [...list];
    switch (sortMode) {
      case "money": sorted.sort((a, b) => (Number(b.money) || 0) - (Number(a.money) || 0)); break;
      case "rebirth": sorted.sort((a, b) => (Number(b.rebirth) || 0) - (Number(a.rebirth) || 0)); break;
      case "rolls": sorted.sort((a, b) => (Number(b.rolls) || 0) - (Number(a.rolls) || 0)); break;
      case "units": sorted.sort((a, b) => (b.unitsCount || 0) - (a.unitsCount || 0)); break;
      default:
        sorted.sort((a, b) => {
          const na = accountNumber(a.sourceAccount), nb = accountNumber(b.sourceAccount);
          if (na !== null && nb !== null && na !== nb) return na - nb;
          return a.sourceAccount.localeCompare(b.sourceAccount);
        });
    }
    return sorted;
  }

  function filterAccounts(list: ADAccount[]): ADAccount[] {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((a) =>
      a.sourceAccount.toLowerCase().includes(q) ||
      (a.dice || "").toLowerCase().includes(q)
    );
  }

  const filtered = filterAccounts(accounts);
  const allOnline = filtered.filter((a) => a.online);
  const allOffline = filtered.filter((a) => !a.online);
  const displayed = sortAccounts(
    tabMode === "online" ? allOnline : tabMode === "offline" ? allOffline : filtered
  );

  const totalMoney = allOnline.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalRebirths = allOnline.reduce((s, a) => s + (Number(a.rebirth) || 0), 0);
  const totalRolls = allOnline.reduce((s, a) => s + (Number(a.rolls) || 0), 0);
  const totalUnits = allOnline.reduce((s, a) => s + (a.unitsCount || 0), 0);

  async function openDetail(name: string) {
    const acc = accounts.find((a) => a.sourceAccount === name) || null;
    setDetail({ name, data: null, loading: true, account: acc });
    setDetailTab("units");
    try {
      const res = await fetch("/api/anime-dice/account-detail?account=" + encodeURIComponent(name));
      const body = await res.json();
      if (res.ok && body.ok) setDetail({ name, data: body, loading: false, account: acc });
      else setDetail({ name, data: null, loading: false, account: acc });
    } catch { setDetail({ name, data: null, loading: false, account: acc }); }
  }

  if (!mounted) return null;

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b14; --surface: #111120; --card: #15152a; --card-hover: #1a1a35;
          --ink: #e8e8f0; --dim: #555570; --accent: #818cf8; --accent2: #a855f7;
          --green: #34d399; --gold: #fbbf24; --red: #ef4444; --cyan: #22d3ee;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .ad { max-width: 1600px; margin: 0 auto; padding: 20px 24px 40px; font-family: 'Inter', system-ui, -apple-system, sans-serif; }

        /* Top bar */
        .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .topbar h1 { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink); }

        /* Tabs + sort + search row */
        .controls { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .pill-tabs { display: flex; gap: 0; }
        .ptab { padding: 8px 18px; font-size: 12px; font-weight: 800; cursor: pointer; color: var(--dim); background: none; border: none; transition: all .15s; border-radius: 20px; }
        .ptab:hover { color: var(--ink); }
        .ptab.active { background: var(--accent); color: #0b0b14; }
        .ptab.active.on { background: var(--green); }
        .ptab.active.off { background: var(--red); color: #fff; }

        .sort-wrap { margin-left: auto; display: flex; align-items: center; gap: 10px; }
        .sort-select { background: var(--surface); color: var(--ink); border: 1px solid #222240; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .sort-select:focus { outline: none; border-color: var(--accent); }
        .search-input { background: var(--surface); color: var(--ink); border: 1px solid #222240; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; width: 200px; }
        .search-input:focus { outline: none; border-color: var(--accent); }
        .search-input::placeholder { color: var(--dim); }

        /* Grid */
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; }

        /* ─── Combined card ─── */
        .combined { background: linear-gradient(135deg, rgba(34,211,238,.04), rgba(139,92,246,.04)), var(--card); border: 1px solid rgba(34,211,238,.15); border-radius: 16px; padding: 20px; cursor: pointer; transition: all .15s; }
        .combined:hover { border-color: rgba(34,211,238,.35); transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(34,211,238,.2), 0 8px 24px rgba(0,0,0,.3); }
        .comb-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .comb-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--accent)); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
        .comb-info { flex: 1; }
        .comb-name { font-size: 16px; font-weight: 900; color: var(--ink); }
        .comb-sub { font-size: 11px; color: var(--dim); margin-top: 2px; }
        .comb-badge { font-size: 9px; font-weight: 900; padding: 4px 10px; border-radius: 6px; background: rgba(34,211,238,.12); color: var(--cyan); border: 1px solid rgba(34,211,238,.25); letter-spacing: .5px; }
        .comb-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .comb-stat { }
        .comb-stat .cs-label { font-size: 10px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
        .comb-stat .cs-value { font-size: 22px; font-weight: 900; margin-top: 2px; }
        .comb-stat .cs-value.money { color: var(--green); }
        .comb-stat .cs-value.rebirth { color: var(--ink); }
        .comb-extras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .comb-extra { background: rgba(255,255,255,.03); border-radius: 8px; padding: 8px 10px; text-align: center; }
        .comb-extra .ce-label { font-size: 9px; font-weight: 700; color: var(--dim); text-transform: uppercase; }
        .comb-extra .ce-value { font-size: 14px; font-weight: 900; color: var(--cyan); margin-top: 2px; }
        .comb-footer { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; }
        .comb-footer-link { font-size: 11px; font-weight: 700; color: var(--cyan); display: flex; align-items: center; gap: 6px; }

        /* ─── Account card ─── */
        .acard { background: var(--card); border: 1px solid #1e1e38; border-radius: 16px; padding: 20px; cursor: pointer; transition: all .15s; position: relative; }
        .acard:hover { background: var(--card-hover); border-color: #2a2a50; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,.3); }
        .acard.offline { opacity: .55; }
        .acard.offline:hover { opacity: .8; }

        .acard-top { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .acard-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: var(--dim); flex-shrink: 0; position: relative; border: 2px solid #222240; }
        .acard-dot { position: absolute; bottom: -1px; right: -1px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--card); }
        .acard-dot.on { background: var(--green); }
        .acard-dot.off { background: var(--red); }
        .acard-nameblock { flex: 1; min-width: 0; }
        .acard-name { font-size: 15px; font-weight: 800; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .acard-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .acard-status { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: .3px; }
        .acard-status.on { background: rgba(52,211,153,.15); color: var(--green); }
        .acard-status.off { background: rgba(239,68,68,.1); color: var(--red); }
        .acard-time { font-size: 10px; color: var(--dim); font-weight: 600; }
        .acard-dice { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: .3px; flex-shrink: 0; }

        .acard-main { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
        .acard-stat .as-label { font-size: 10px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .3px; }
        .acard-stat .as-value { font-size: 20px; font-weight: 900; margin-top: 2px; }
        .acard-stat .as-value.money { color: var(--green); }
        .acard-stat .as-value.rebirth { color: var(--ink); }

        /* Best unit row */
        .acard-unit { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 10px 12px; background: rgba(255,255,255,.02); border-radius: 10px; }
        .unit-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .unit-name { font-size: 13px; font-weight: 700; color: var(--ink); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .unit-badges { display: flex; gap: 4px; flex-shrink: 0; }
        .ubadge { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 4px; letter-spacing: .3px; }

        /* Toggle pills */
        .acard-toggles { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 12px; }
        .toggle-pill { font-size: 9px; font-weight: 800; padding: 4px 10px; border-radius: 5px; letter-spacing: .3px; text-transform: uppercase; }
        .toggle-pill.on { background: rgba(52,211,153,.12); color: var(--green); }
        .toggle-pill.off { background: rgba(255,255,255,.03); color: var(--dim); }

        /* Footer link */
        .acard-footer { display: flex; align-items: center; gap: 6px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.04); }
        .acard-footer-link { font-size: 11px; font-weight: 700; color: var(--cyan); display: flex; align-items: center; gap: 6px; flex: 1; }
        .acard-footer-arrow { margin-left: auto; color: var(--dim); font-size: 16px; }

        .empty { color: var(--dim); text-align: center; padding: 80px 0; font-size: 14px; }

        /* ─── Detail modal ─── */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: flex-start; justify-content: center; padding: 30px 16px; overflow-y: auto; z-index: 50; backdrop-filter: blur(6px); }
        .modal { background: var(--bg); border: 1px solid #1e1e38; border-radius: 20px; width: 100%; max-width: 960px; overflow: hidden; }
        .modal-head { background: var(--card); padding: 20px 24px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid rgba(255,255,255,.04); }
        .modal-head .mh-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: var(--dim); position: relative; border: 2px solid #222240; flex-shrink: 0; }
        .modal-head .mh-dot { position: absolute; bottom: -1px; right: -1px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--card); }
        .modal-head .mh-dot.on { background: var(--green); }
        .modal-head .mh-dot.off { background: var(--red); }
        .modal-head .mh-info { flex: 1; }
        .modal-head .mh-name { font-size: 18px; font-weight: 900; }
        .modal-head .mh-sub { font-size: 11px; color: var(--dim); margin-top: 2px; }
        .mh-badge { font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 6px; letter-spacing: .3px; }
        .mh-badge.on { background: rgba(52,211,153,.12); color: var(--green); }
        .mh-badge.off { background: rgba(239,68,68,.1); color: var(--red); }
        .modal-close { background: none; border: none; color: var(--dim); font-size: 22px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
        .modal-close:hover { color: var(--ink); background: var(--surface); }

        .modal-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; padding: 16px 24px; background: var(--card); border-bottom: 1px solid rgba(255,255,255,.04); }
        .ms { background: var(--surface); border-radius: 10px; padding: 10px 12px; }
        .ms .ms-l { font-size: 9px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
        .ms .ms-v { font-size: 16px; font-weight: 900; }

        .modal-tabs { display: flex; gap: 0; padding: 0 24px; background: var(--card); border-bottom: 1px solid rgba(255,255,255,.04); overflow-x: auto; }
        .mtab { padding: 12px 18px; font-size: 12px; font-weight: 800; cursor: pointer; color: var(--dim); background: none; border: none; border-bottom: 2px solid transparent; transition: all .15s; white-space: nowrap; }
        .mtab:hover { color: var(--ink); }
        .mtab.active { color: var(--cyan); border-bottom-color: var(--cyan); }

        .modal-body { padding: 20px 24px; max-height: 60vh; overflow-y: auto; }
        .detail-empty { color: var(--dim); font-size: 13px; padding: 30px 0; text-align: center; }

        /* Unit cards in detail */
        .ugrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .ucard { background: var(--card); border: 1px solid #1e1e38; border-radius: 12px; padding: 14px; transition: border-color .15s; }
        .ucard:hover { border-color: #2a2a50; }
        .ucard-top { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
        .ucard-name { font-size: 14px; font-weight: 800; margin-bottom: 6px; }
        .ucard-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        .ub { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 5px; letter-spacing: .3px; }
        .ucard-amount { font-size: 10px; font-weight: 700; color: var(--dim); margin-left: auto; }

        /* Upgrade cards */
        .upgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .upcard { background: var(--card); border: 1px solid #1e1e38; border-radius: 10px; padding: 14px; display: flex; align-items: center; gap: 12px; }
        .upcard .up-name { font-size: 13px; font-weight: 700; flex: 1; }
        .upcard .up-lv { font-size: 18px; font-weight: 900; color: var(--accent); }

        /* Dice chips */
        .dgrid { display: flex; flex-wrap: wrap; gap: 8px; }
        .dchip { background: rgba(129,140,248,.06); border: 1px solid rgba(129,140,248,.15); border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 700; color: var(--accent); }

        /* Gamepass list */
        .gp-list { display: flex; flex-direction: column; gap: 6px; }
        .gp-row { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid #1e1e38; border-radius: 10px; padding: 10px 14px; }
        .gp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .gp-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .gp-dot.off { background: #333; }
        .gp-name { flex: 1; font-size: 13px; font-weight: 700; }
        .gp-status { font-size: 11px; font-weight: 800; }
        .gp-status.on { color: var(--green); }
        .gp-status.off { color: var(--dim); }
      `}</style>

      <div className="ad">
        <div className="topbar">
          <h1>Control Dashboard</h1>
        </div>

        <div className="controls">
          <div className="pill-tabs">
            <button className={`ptab ${tabMode === "all" ? "active" : ""}`} onClick={() => setTabMode("all")}>ALL</button>
            <button className={`ptab ${tabMode === "online" ? "active on" : ""}`} onClick={() => setTabMode("online")}>ONLINE ({allOnline.length})</button>
            <button className={`ptab ${tabMode === "offline" ? "active off" : ""}`} onClick={() => setTabMode("offline")}>OFFLINE ({allOffline.length})</button>
          </div>
          <div className="sort-wrap">
            <select className="sort-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="default">SORT: DEFAULT</option>
              <option value="money">MONEY (HIGH - LOW)</option>
              <option value="rebirth">REBIRTH (HIGH - LOW)</option>
              <option value="rolls">SESSION ROLLS (HIGH - LOW)</option>
              <option value="units">UNIT COUNT (HIGH - LOW)</option>
            </select>
            <input className="search-input" type="text" placeholder="Search accounts, dice..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {displayed.length === 0 && accounts.length === 0 ? (
          <div className="empty">Belum ada akun Anime Dice yang lapor. Pastikan script sudah jalan dan POST ke /api/anime-dice/monitor.</div>
        ) : displayed.length === 0 ? (
          <div className="empty">Tidak ada akun yang cocok dengan filter.</div>
        ) : (
          <div className="grid">
            <CombinedCard
              accounts={displayed}
              totalMoney={totalMoney}
              totalRebirths={totalRebirths}
              totalRolls={totalRolls}
              totalUnits={totalUnits}
              onlineCount={allOnline.length}
              totalCount={filtered.length}
            />
            {displayed.map((a) => (
              <AccountCard key={a.sourceAccount} account={a} onOpen={openDetail} />
            ))}
          </div>
        )}

        {detail && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setDetail(null); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <DetailModal detail={detail} tab={detailTab} setTab={setDetailTab} onClose={() => setDetail(null)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CombinedCard({ accounts, totalMoney, totalRebirths, totalRolls, totalUnits, onlineCount, totalCount }: {
  accounts: ADAccount[]; totalMoney: number; totalRebirths: number; totalRolls: number; totalUnits: number; onlineCount: number; totalCount: number;
}) {
  return (
    <div className="combined">
      <div className="comb-top">
        <div className="comb-avatar">&#x1F465;</div>
        <div className="comb-info">
          <div className="comb-name">All Accounts</div>
          <div className="comb-sub">{onlineCount} of {totalCount} Online</div>
        </div>
        <span className="comb-badge">COMBINED</span>
      </div>
      <div className="comb-stats">
        <div className="comb-stat">
          <div className="cs-label">Combined Money</div>
          <div className="cs-value money">{fmtMoney(totalMoney)}</div>
        </div>
        <div className="comb-stat">
          <div className="cs-label">Total Rebirths</div>
          <div className="cs-value rebirth">{totalRebirths}</div>
        </div>
      </div>
      <div className="comb-extras">
        <div className="comb-extra">
          <div className="ce-label">Units</div>
          <div className="ce-value">{fmtNum(totalUnits)}</div>
        </div>
        <div className="comb-extra">
          <div className="ce-label">Rolls</div>
          <div className="ce-value">{fmtNum(totalRolls)}</div>
        </div>
        <div className="comb-extra">
          <div className="ce-label">Accounts</div>
          <div className="ce-value">{totalCount}</div>
        </div>
      </div>
      <div className="comb-footer">
        <span className="comb-footer-link">Click to inspect All Accounts Telemetry <span>&#x2192;</span></span>
      </div>
    </div>
  );
}

function AccountCard({ account: a, onOpen }: { account: ADAccount; onOpen: (name: string) => void }) {
  const isOff = !a.online;
  const bestUnit = (a.topUnits || [])[0] || null;
  const dc = diceColor(a.dice || "");

  return (
    <div className={`acard ${isOff ? "offline" : ""}`} onClick={() => onOpen(a.sourceAccount)}>
      <div className="acard-top">
        <div className="acard-avatar">
          {(a.sourceAccount || "?")[0].toUpperCase()}
          <span className={`acard-dot ${isOff ? "off" : "on"}`} />
        </div>
        <div className="acard-nameblock">
          <div className="acard-name">{a.sourceAccount}</div>
          <div className="acard-meta">
            <span className={`acard-status ${isOff ? "off" : "on"}`}>{isOff ? "OFFLINE" : "ONLINE"}</span>
            <span className="acard-time">{fmtLastSeen(a.lastSeen)}</span>
          </div>
        </div>
        {a.dice && (
          <span className="acard-dice" style={{ background: dc + "18", color: dc, border: `1px solid ${dc}30` }}>
            &#x1F3B2; {a.dice.toUpperCase()}
          </span>
        )}
      </div>

      <div className="acard-main">
        <div className="acard-stat">
          <div className="as-label">Balance Money</div>
          <div className="as-value money">{fmtMoney(a.money)}</div>
        </div>
        <div className="acard-stat" style={{ textAlign: "right" }}>
          <div className="as-label">Rebirth Level</div>
          <div className="as-value rebirth">R{a.rebirth ?? 0}</div>
        </div>
      </div>

      {bestUnit && (
        <div className="acard-unit">
          <div className="unit-icon">&#x2694;</div>
          <span className="unit-name">{bestUnit.variant ? `${bestUnit.variant} ` : ""}{bestUnit.name}</span>
          <div className="unit-badges">
            {bestUnit.variant && (
              <span className="ubadge" style={{ background: "rgba(129,140,248,.1)", color: "var(--accent)" }}>{bestUnit.variant === "Titanic" ? "None" : bestUnit.variant}</span>
            )}
            {!bestUnit.variant && (
              <span className="ubadge" style={{ background: "rgba(255,255,255,.04)", color: "var(--dim)" }}>None</span>
            )}
            {bestUnit.mutation && (() => {
              const ms = MUTATION_STYLES[bestUnit.mutation];
              return <span className="ubadge" style={ms ? { background: ms.bg, color: ms.color } : { background: "rgba(167,139,250,.1)", color: "#c4b5fd" }}>{bestUnit.mutation}</span>;
            })()}
          </div>
        </div>
      )}

      <div className="acard-toggles">
        <span className={`toggle-pill ${a.autoRoll ? "on" : "off"}`}>ROLL</span>
        <span className={`toggle-pill ${(a.autoSell ?? 0) > 0 ? "on" : "off"}`}>BALANCE</span>
        <span className="toggle-pill off">AFK</span>
      </div>

      <div className="acard-footer">
        <span className="acard-footer-link">Click to open full telemetry preview</span>
        <span className="acard-footer-arrow">&#x2192;</span>
      </div>
    </div>
  );
}

function DetailModal({ detail, tab, setTab, onClose }: {
  detail: { name: string; data: ADDetail | null; loading: boolean; account: ADAccount | null };
  tab: DetailTab; setTab: (t: DetailTab) => void; onClose: () => void;
}) {
  const acc = detail.account;
  const isOnline = acc?.online ?? false;

  return (
    <>
      <div className="modal-head">
        <div className="mh-avatar">
          {(detail.name || "?")[0].toUpperCase()}
          <span className={`mh-dot ${isOnline ? "on" : "off"}`} />
        </div>
        <div className="mh-info">
          <div className="mh-name">{detail.name}</div>
          <div className="mh-sub">{acc?.dice ? `${acc.dice} Dice` : ""} {acc?.vip ? " · VIP" : ""}</div>
        </div>
        <span className={`mh-badge ${isOnline ? "on" : "off"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      {detail.loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Loading...</div>
      ) : !detail.data ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>No detail data available.</div>
      ) : (
        <>
          <div className="modal-stats">
            <div className="ms"><div className="ms-l">Money</div><div className="ms-v" style={{ color: "var(--green)" }}>{fmtMoney(acc?.money)}</div></div>
            <div className="ms"><div className="ms-l">Rebirth</div><div className="ms-v" style={{ color: "var(--accent2)" }}>R{acc?.rebirth ?? 0}</div></div>
            <div className="ms"><div className="ms-l">Rolls</div><div className="ms-v" style={{ color: "var(--accent)" }}>{fmtNum(acc?.rolls)}</div></div>
            <div className="ms"><div className="ms-l">Units</div><div className="ms-v" style={{ color: "var(--cyan)" }}>{detail.data.unitsCount}</div></div>
            <div className="ms"><div className="ms-l">Discovered</div><div className="ms-v">{detail.data.discoveredCount}</div></div>
            <div className="ms"><div className="ms-l">Slots</div><div className="ms-v">{detail.data.slotsCount}</div></div>
          </div>

          <div className="modal-tabs">
            <button className={`mtab ${tab === "units" ? "active" : ""}`} onClick={() => setTab("units")}>Units Roster ({(detail.data?.topUnits || []).length})</button>
            <button className={`mtab ${tab === "upgrades" ? "active" : ""}`} onClick={() => setTab("upgrades")}>Upgrades & Dice</button>
            <button className={`mtab ${tab === "backpack" ? "active" : ""}`} onClick={() => setTab("backpack")}>Gamepasses</button>
          </div>

          <div className="modal-body">
            {tab === "units" && <UnitsTab units={detail.data?.topUnits || []} />}
            {tab === "upgrades" && <UpgradesDiceTab upgrades={detail.data?.upgrades || {}} dice={detail.data?.ownedDice || []} />}
            {tab === "backpack" && <GamepassesTab gamepasses={detail.data?.gamepasses || {}} />}
          </div>
        </>
      )}
    </>
  );
}

function UnitsTab({ units }: { units: Unit[] }) {
  const [filter, setFilter] = useState("");
  if (units.length === 0) return <div className="detail-empty">No unit data available.</div>;
  const filtered = filter.trim()
    ? units.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase()) || u.rarity.toLowerCase().includes(filter.toLowerCase()) || (u.mutation || "").toLowerCase().includes(filter.toLowerCase()))
    : units;
  return (
    <>
      <input className="search-input" style={{ width: "100%", marginBottom: 14 }} placeholder="Search unit, trait, mutation..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="ugrid">
        {filtered.map((u, i) => {
          const rc = rarityColor(u.rarity);
          return (
            <div key={i} className="ucard">
              <div className="ucard-top">
                {u.variant && <span className="ub" style={{ background: "rgba(129,140,248,.1)", color: "var(--accent)" }}>{u.variant === "Titanic" ? "S" : u.variant === "Huge" ? "A+" : u.variant[0]}</span>}
                {u.level != null && <span className="ub" style={{ background: "rgba(255,255,255,.04)", color: "var(--dim)" }}>Lv. {u.level}</span>}
                <span className="ub" style={{ background: rc + "20", color: rc }}>{u.rarity.toUpperCase()}</span>
              </div>
              <div className="ucard-name" style={{ color: rc }}>{u.variant ? `${u.variant} ` : ""}{u.name}</div>
              <div className="ucard-meta">
                {u.mutation && (() => {
                  const ms = MUTATION_STYLES[u.mutation];
                  return <span className="ub" style={ms ? { background: ms.bg, color: ms.color } : { background: "rgba(167,139,250,.1)", color: "#c4b5fd" }}>{u.mutation}</span>;
                })()}
                {!u.mutation && <span className="ub" style={{ background: "rgba(255,255,255,.04)", color: "var(--dim)" }}>No Mutation</span>}
                <span className="ucard-amount">x{u.amount}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function UpgradesDiceTab({ upgrades, dice }: { upgrades: Record<string, number>; dice: string[] }) {
  const entries = Object.entries(upgrades);
  return (
    <>
      {entries.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dim)", marginBottom: 10, letterSpacing: ".5px" }}>UPGRADES</div>
          <div className="upgrid" style={{ marginBottom: 20 }}>
            {entries.map(([name, level]) => (
              <div key={name} className="upcard">
                <span className="up-name">{name}</span>
                <span className="up-lv">Lv. {level}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {dice.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dim)", marginBottom: 10, letterSpacing: ".5px" }}>OWNED DICE ({dice.length})</div>
          <div className="dgrid">
            {dice.map((d) => {
              const c = diceColor(d);
              return <span key={d} className="dchip" style={{ color: c, borderColor: c + "25", background: c + "08" }}>&#x1F3B2; {d}</span>;
            })}
          </div>
        </>
      )}
      {entries.length === 0 && dice.length === 0 && <div className="detail-empty">No upgrade or dice data.</div>}
    </>
  );
}

function GamepassesTab({ gamepasses }: { gamepasses: Record<string, boolean> }) {
  const entries = Object.entries(gamepasses);
  if (entries.length === 0) return <div className="detail-empty">No gamepass data.</div>;
  return (
    <div className="gp-list">
      {entries.map(([name, owned]) => (
        <div key={name} className="gp-row">
          <span className={`gp-dot ${owned ? "on" : "off"}`} />
          <span className="gp-name">{name}</span>
          <span className={`gp-status ${owned ? "on" : "off"}`}>{owned ? "OWNED" : "NOT OWNED"}</span>
        </div>
      ))}
    </div>
  );
}
