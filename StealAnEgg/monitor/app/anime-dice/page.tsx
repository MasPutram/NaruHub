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

function rarityColor(rarity: string): string {
  return RARITY_COLORS[rarity] || "#71717a";
}

const VARIANT_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Titanic: { bg: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff", border: "rgba(168,85,247,.5)" },
  Huge: { bg: "linear-gradient(135deg, #059669, #34d399)", color: "#fff", border: "rgba(52,211,153,.5)" },
};

const MUTATION_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Diamond: { bg: "linear-gradient(135deg, #67e8f9, #22d3ee)", color: "#0c4a6e", border: "rgba(34,211,238,.5)" },
  Gold: { bg: "linear-gradient(135deg, #fde68a, #f59e0b)", color: "#7c4a03", border: "rgba(245,158,11,.5)" },
  Silver: { bg: "linear-gradient(135deg, #f3f4f6, #cbd5e1)", color: "#4b5563", border: "rgba(148,163,184,.5)" },
  Ruby: { bg: "linear-gradient(135deg, #fca5a5, #ef4444)", color: "#fff", border: "rgba(239,68,68,.5)" },
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e30) return "$" + (n / 1e30).toFixed(1) + "No";
  if (abs >= 1e27) return "$" + (n / 1e27).toFixed(1) + "Oc";
  if (abs >= 1e24) return "$" + (n / 1e24).toFixed(1) + "Sp";
  if (abs >= 1e21) return "$" + (n / 1e21).toFixed(1) + "Sx";
  if (abs >= 1e18) return "$" + (n / 1e18).toFixed(1) + "Qi";
  if (abs >= 1e15) return "$" + (n / 1e15).toFixed(1) + "Qa";
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

function fmtUptime(firstSeen?: number): string {
  if (!firstSeen) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - firstSeen));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtLastSeen(lastSeen?: number): string {
  if (!lastSeen) return "Unknown";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - lastSeen));
  if (s < 60) return `${s}s lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m lalu`;
  const d = Math.floor(h / 24);
  return `${d}h ${h % 24}j lalu`;
}

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

type TabMode = "all" | "online" | "offline";

export default function AnimeDicePage() {
  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<ADAccount[]>([]);
  const [sortMode, setSortMode] = useState("name_asc");
  const [tabMode, setTabMode] = useState<TabMode>("all");
  const [detail, setDetail] = useState<{ name: string; data: ADDetail | null; loading: boolean; account: ADAccount | null } | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/anime-dice/accounts");
      const data = await res.json();
      const all = (data.accounts || []).filter((a: ADAccount) => !a.forSale);
      setAccounts(all);
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
      case "money_desc":
        sorted.sort((a, b) => (Number(b.money) || 0) - (Number(a.money) || 0));
        break;
      case "rolls_desc":
        sorted.sort((a, b) => (Number(b.rolls) || 0) - (Number(a.rolls) || 0));
        break;
      case "rebirth_desc":
        sorted.sort((a, b) => (Number(b.rebirth) || 0) - (Number(a.rebirth) || 0));
        break;
      case "units_desc":
        sorted.sort((a, b) => (b.unitsCount || 0) - (a.unitsCount || 0));
        break;
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

  const allOnline = accounts.filter((a) => a.online);
  const allOffline = accounts.filter((a) => !a.online);
  const displayed = sortAccounts(
    tabMode === "online" ? allOnline : tabMode === "offline" ? allOffline : accounts
  );

  const totalMoney = allOnline.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalRolls = allOnline.reduce((s, a) => s + (Number(a.rolls) || 0), 0);
  const totalUnits = allOnline.reduce((s, a) => s + (a.unitsCount || 0), 0);

  async function openDetail(name: string) {
    const acc = accounts.find((a) => a.sourceAccount === name) || null;
    setDetail({ name, data: null, loading: true, account: acc });
    try {
      const res = await fetch("/api/anime-dice/account-detail?account=" + encodeURIComponent(name));
      const body = await res.json();
      if (res.ok && body.ok) setDetail({ name, data: body, loading: false, account: acc });
      else setDetail({ name, data: null, loading: false, account: acc });
    } catch {
      setDetail({ name, data: null, loading: false, account: acc });
    }
  }

  if (!mounted) return null;

  return (
    <>
      <style>{`
        :root {
          --bg: #0a0a14; --surface: #10101c; --card: #141422; --card-border: #1e1e32;
          --ink: #e8e8f0; --dim: #6b6b88; --accent: #818cf8; --accent2: #a855f7;
          --green: #34d399; --gold: #fbbf24; --red: #ef4444;
        }
        * { box-sizing: border-box; }
        .ad-dash { max-width: 1600px; margin: 0 auto; padding: 24px 28px 40px; }

        .ad-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .ad-head-left .eyebrow { color: var(--accent2); font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
        .ad-head-left h1 { font-size: 24px; margin: 0; font-weight: 900; }
        .conn-badge { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: var(--green); }
        .conn-badge .cdot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); }

        .summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .sum-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; border-left: 3px solid var(--dim); }
        .sum-card .slabel { font-size: 10px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; margin-bottom: 6px; }
        .sum-card .sval { font-size: 22px; font-weight: 900; }
        .sum-card .ssub { font-size: 11px; color: var(--dim); margin-top: 2px; }

        .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .tabs { display: flex; background: var(--surface); border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; }
        .tab { padding: 8px 18px; font-size: 12px; font-weight: 800; letter-spacing: .5px; cursor: pointer; color: var(--dim); background: transparent; border: none; transition: all .15s; display: flex; align-items: center; gap: 6px; }
        .tab:hover { color: var(--ink); }
        .tab.active { background: var(--accent); color: #1a1030; }
        .tab.active.online-tab { background: var(--green); color: #0a2018; }
        .tab.active.offline-tab { background: var(--red); color: #fff; }
        .tab .tcount { font-size: 10px; font-weight: 900; opacity: .8; }
        .tool-sep { width: 1px; height: 28px; background: var(--card-border); }
        .toolbar label { color: var(--dim); font-size: 11px; font-weight: 800; }
        .toolbar select { background: var(--card); color: var(--ink); border: 1px solid var(--card-border); border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; }
        .toolbar select:focus { outline: none; border-color: var(--accent); }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }

        .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; cursor: pointer; transition: all .15s; position: relative; }
        .card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,.3); }
        .card.is-offline { opacity: .5; }
        .card.is-offline:hover { opacity: .8; border-color: var(--dim); }
        .card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
        .status-dot.off { background: var(--red); box-shadow: 0 0 6px rgba(239,68,68,.4); }
        .acc-name { font-weight: 800; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .time-tag { font-size: 10px; font-weight: 700; flex-shrink: 0; }
        .time-tag.on { color: var(--dim); }
        .time-tag.off { color: var(--red); }

        .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; margin-bottom: 10px; }
        .st .sl { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .3px; text-transform: uppercase; }
        .st .sv { font-size: 14px; font-weight: 800; }
        .st.money .sv { color: var(--gold); }
        .st.rolls .sv { color: var(--accent); }
        .st.rebirth .sv { color: var(--accent2); }
        .st.units .sv { color: var(--green); }

        .dice-tag { display: inline-flex; align-items: center; gap: 5px; background: rgba(129,140,248,.1); border: 1px solid rgba(129,140,248,.25); border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 10px; }
        .vip-badge { display: inline-block; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1a1030; font-size: 9px; font-weight: 900; padding: 2px 8px; border-radius: 4px; letter-spacing: .5px; margin-left: 8px; }
        .rebirth-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(168,85,247,.12); border: 1px solid rgba(168,85,247,.3); border-radius: 6px; padding: 3px 8px; font-size: 10px; font-weight: 800; color: var(--accent2); }

        .units-section { margin-top: 10px; border-top: 1px solid var(--card-border); padding-top: 10px; }
        .units-label { font-size: 9px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .3px; margin-bottom: 6px; }
        .unit-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .unit-chip { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .unit-chip-more { font-size: 10px; color: var(--dim); font-weight: 700; }

        .gp-row { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
        .gp-pill { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
        .gp-pill.owned { background: rgba(52,211,153,.12); color: var(--green); border: 1px solid rgba(52,211,153,.3); }
        .gp-pill.notowned { background: rgba(107,107,136,.06); color: var(--dim); border: 1px solid rgba(107,107,136,.15); }

        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }

        /* Detail modal */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: flex-start; justify-content: center; padding: 30px 16px; overflow-y: auto; z-index: 50; backdrop-filter: blur(4px); }
        .modal { background: var(--bg); border: 1px solid var(--card-border); border-radius: 20px; width: 100%; max-width: 820px; overflow: hidden; }
        .modal-header { background: var(--card); padding: 20px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--card-border); }
        .modal-header .mh-dot { width: 10px; height: 10px; border-radius: 50%; }
        .modal-header .mh-dot.on { background: var(--green); box-shadow: 0 0 10px var(--green); }
        .modal-header .mh-dot.off { background: var(--red); box-shadow: 0 0 8px rgba(239,68,68,.4); }
        .modal-header .mh-name { font-size: 20px; font-weight: 900; flex: 1; }
        .mh-badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; letter-spacing: .5px; }
        .mh-badge.on { background: rgba(52,211,153,.15); color: var(--green); border: 1px solid rgba(52,211,153,.3); }
        .mh-badge.off { background: rgba(239,68,68,.12); color: var(--red); border: 1px solid rgba(239,68,68,.25); }
        .modal-close { background: none; border: none; color: var(--dim); font-size: 24px; cursor: pointer; line-height: 1; padding: 4px 8px; border-radius: 6px; }
        .modal-close:hover { color: var(--ink); background: var(--surface); }

        .modal-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 16px 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .ms-card { background: var(--surface); border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px; }
        .ms-card .mslabel { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 4px; }
        .ms-card .msval { font-size: 16px; font-weight: 900; }

        .modal-tabs { display: flex; gap: 0; padding: 0 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .mtab { padding: 12px 20px; font-size: 12px; font-weight: 800; letter-spacing: .3px; cursor: pointer; color: var(--dim); background: transparent; border: none; border-bottom: 2px solid transparent; transition: all .15s; }
        .mtab:hover { color: var(--ink); }
        .mtab.active { color: var(--accent2); border-bottom-color: var(--accent2); }

        .modal-body { padding: 20px 24px; max-height: 55vh; overflow-y: auto; }
        .detail-empty { color: var(--dim); font-size: 13px; padding: 20px 0; text-align: center; }

        .upgrade-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .upg-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; }
        .upg-label { font-size: 12px; font-weight: 700; color: var(--ink); flex: 1; }
        .upg-level { font-size: 16px; font-weight: 900; color: var(--accent); }

        .dice-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .dice-chip { background: rgba(129,140,248,.08); border: 1px solid rgba(129,140,248,.2); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--accent); }

        .unit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
        .ug-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px; transition: border-color .15s; }
        .ug-card:hover { border-color: #333355; }
        .ug-name { font-size: 13px; font-weight: 800; margin-bottom: 6px; }
        .ug-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        .ug-badge { font-size: 8px; font-weight: 800; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: .3px; }
        .ug-amount { font-size: 10px; font-weight: 700; color: var(--dim); margin-left: auto; }
      `}</style>

      <div className="ad-dash">
        <div className="ad-head">
          <div className="ad-head-left">
            <div className="eyebrow">ANIME DICE</div>
            <h1>Monitor Dashboard</h1>
          </div>
          <div className="conn-badge">
            <span className="cdot" />
            {allOnline.length} / {accounts.length} Online
          </div>
        </div>

        <div className="summary-row">
          <div className="sum-card" style={{ borderLeftColor: "var(--green)" }}>
            <div className="slabel" style={{ color: "var(--green)" }}>ACTIVE ACCOUNTS</div>
            <div className="sval">{allOnline.length} <span style={{ color: "var(--dim)", fontSize: 14, fontWeight: 700 }}>/ {accounts.length}</span></div>
            <div className="ssub">{allOffline.length} offline</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--gold)" }}>
            <div className="slabel" style={{ color: "var(--gold)" }}>TOTAL MONEY</div>
            <div className="sval" style={{ color: "var(--gold)" }}>{fmtMoney(totalMoney)}</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--accent)" }}>
            <div className="slabel" style={{ color: "var(--accent)" }}>TOTAL ROLLS</div>
            <div className="sval" style={{ color: "var(--accent)" }}>{fmtNum(totalRolls)}</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--green)" }}>
            <div className="slabel" style={{ color: "var(--green)" }}>TOTAL UNITS</div>
            <div className="sval" style={{ color: "var(--green)" }}>{fmtNum(totalUnits)}</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="tabs">
            <button className={`tab ${tabMode === "all" ? "active" : ""}`} onClick={() => setTabMode("all")}>ALL <span className="tcount">{accounts.length}</span></button>
            <button className={`tab online-tab ${tabMode === "online" ? "active" : ""}`} onClick={() => setTabMode("online")}>ONLINE <span className="tcount">{allOnline.length}</span></button>
            <button className={`tab offline-tab ${tabMode === "offline" ? "active" : ""}`} onClick={() => setTabMode("offline")}>OFFLINE <span className="tcount">{allOffline.length}</span></button>
          </div>
          <div className="tool-sep" />
          <label>Sort:</label>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="name_asc">Nama (Nomor)</option>
            <option value="money_desc">Money Tertinggi</option>
            <option value="rolls_desc">Rolls Terbanyak</option>
            <option value="rebirth_desc">Rebirth Tertinggi</option>
            <option value="units_desc">Units Terbanyak</option>
          </select>
        </div>

        {displayed.length === 0 ? (
          <div className="empty">
            {accounts.length > 0
              ? tabMode === "offline" ? "Tidak ada akun offline saat ini."
              : tabMode === "online" ? "Tidak ada akun online saat ini."
              : "Tidak ada akun yang cocok."
              : 'Belum ada akun Anime Dice yang lapor. Pastikan script sudah jalan dan POST ke /api/anime-dice/monitor.'}
          </div>
        ) : (
          <div className="grid">
            {displayed.map((a) => (
              <ADAccountCard key={a.sourceAccount} account={a} onOpen={openDetail} />
            ))}
          </div>
        )}

        {detail && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setDetail(null); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <ADDetailModal detail={detail} onClose={() => setDetail(null)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ADAccountCard({ account: a, onOpen }: { account: ADAccount; onOpen: (name: string) => void }) {
  const isOff = !a.online;
  const previewUnits = (a.topUnits || []).slice(0, 3);
  const moreUnits = Math.max(0, (a.topUnits || []).length - 3);

  return (
    <div className={`card ${isOff ? "is-offline" : ""}`} onClick={() => onOpen(a.sourceAccount)}>
      <div className="card-top">
        <span className={`status-dot ${isOff ? "off" : "on"}`} />
        <span className="acc-name">{a.sourceAccount}</span>
        {a.vip && <span className="vip-badge">VIP</span>}
        <span className={`time-tag ${isOff ? "off" : "on"}`}>
          {isOff ? fmtLastSeen(a.lastSeen) : fmtUptime(a.firstSeen) || "Active"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        {a.dice && <span className="dice-tag">&#x1F3B2; {a.dice}</span>}
        {(a.rebirth ?? 0) > 0 && <span className="rebirth-badge">&#x1F504; Rebirth {a.rebirth}</span>}
      </div>

      <div className="stats">
        <div className="st money"><div className="sl">MONEY</div><div className="sv">{fmtMoney(a.money)}</div></div>
        <div className="st rolls"><div className="sl">ROLLS</div><div className="sv">{fmtNum(a.rolls)}</div></div>
        <div className="st units"><div className="sl">UNITS</div><div className="sv">{a.unitsCount} <span style={{ color: "var(--dim)", fontSize: 11 }}>({a.unitTypesCount} types)</span></div></div>
        <div className="st"><div className="sl">DISCOVERED</div><div className="sv">{a.discoveredCount}</div></div>
        <div className="st"><div className="sl">SLOTS</div><div className="sv">{a.slotsCount}</div></div>
        <div className="st"><div className="sl">DICE OWNED</div><div className="sv">{a.ownedDiceCount}</div></div>
      </div>

      {Object.keys(a.gamepasses || {}).length > 0 && (
        <div className="gp-row">
          {Object.entries(a.gamepasses).map(([name, owned]) => (
            <span key={name} className={`gp-pill ${owned ? "owned" : "notowned"}`}>{name}</span>
          ))}
        </div>
      )}

      {previewUnits.length > 0 && (
        <div className="units-section">
          <div className="units-label">TOP UNITS</div>
          <div className="unit-chips">
            {previewUnits.map((u, i) => {
              const rc = rarityColor(u.rarity);
              return (
                <span key={i} className="unit-chip" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}33` }}>
                  {u.variant && <span style={{ fontSize: 8, fontWeight: 900 }}>[{u.variant}]</span>}
                  {u.name}
                  {u.mutation && <span style={{ fontSize: 8, opacity: .8 }}>({u.mutation})</span>}
                </span>
              );
            })}
            {moreUnits > 0 && <span className="unit-chip-more">+{moreUnits} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

type DetailTabMode = "units" | "upgrades" | "dice" | "gamepasses";

function ADDetailModal({ detail, onClose }: {
  detail: { name: string; data: ADDetail | null; loading: boolean; account: ADAccount | null };
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTabMode>("units");
  const acc = detail.account;
  const isOnline = acc?.online ?? false;

  return (
    <>
      <div className="modal-header">
        <span className={`mh-dot ${isOnline ? "on" : "off"}`} />
        <span className="mh-name">{detail.name}</span>
        {acc?.vip && <span className="vip-badge">VIP</span>}
        <span className={`mh-badge ${isOnline ? "on" : "off"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      {detail.loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Memuat data...</div>
      ) : !detail.data ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Belum ada data lengkap buat akun ini.</div>
      ) : (
        <>
          <div className="modal-stats">
            <div className="ms-card">
              <div className="mslabel">MONEY</div>
              <div className="msval" style={{ color: "var(--gold)" }}>{fmtMoney(acc?.money)}</div>
            </div>
            <div className="ms-card">
              <div className="mslabel">ROLLS</div>
              <div className="msval" style={{ color: "var(--accent)" }}>{fmtNum(acc?.rolls)}</div>
            </div>
            <div className="ms-card">
              <div className="mslabel">REBIRTH</div>
              <div className="msval" style={{ color: "var(--accent2)" }}>{acc?.rebirth ?? 0}</div>
            </div>
            <div className="ms-card">
              <div className="mslabel">DICE</div>
              <div className="msval">{acc?.dice || "-"}</div>
            </div>
            <div className="ms-card">
              <div className="mslabel">UNITS</div>
              <div className="msval" style={{ color: "var(--green)" }}>{detail.data.unitsCount}</div>
            </div>
            <div className="ms-card">
              <div className="mslabel">DISCOVERED</div>
              <div className="msval">{detail.data.discoveredCount}</div>
            </div>
          </div>

          <div className="modal-tabs">
            <button className={`mtab ${tab === "units" ? "active" : ""}`} onClick={() => setTab("units")}>Units ({(detail.data?.topUnits || []).length})</button>
            <button className={`mtab ${tab === "upgrades" ? "active" : ""}`} onClick={() => setTab("upgrades")}>Upgrades ({Object.keys(detail.data?.upgrades || {}).length})</button>
            <button className={`mtab ${tab === "dice" ? "active" : ""}`} onClick={() => setTab("dice")}>Dice ({(detail.data?.ownedDice || []).length})</button>
            <button className={`mtab ${tab === "gamepasses" ? "active" : ""}`} onClick={() => setTab("gamepasses")}>Gamepasses</button>
          </div>

          <div className="modal-body">
            {tab === "units" && <UnitsTab units={detail.data?.topUnits || []} />}
            {tab === "upgrades" && <UpgradesTab upgrades={detail.data?.upgrades || {}} />}
            {tab === "dice" && <DiceTab dice={detail.data?.ownedDice || []} />}
            {tab === "gamepasses" && <GamepassesTab gamepasses={detail.data?.gamepasses || {}} />}
          </div>
        </>
      )}
    </>
  );
}

function UnitsTab({ units }: { units: Unit[] }) {
  if (units.length === 0) return <div className="detail-empty">Belum ada data unit.</div>;
  return (
    <div className="unit-grid">
      {units.map((u, i) => {
        const rc = rarityColor(u.rarity);
        const vc = u.variant ? VARIANT_COLORS[u.variant] : null;
        const mc = u.mutation ? MUTATION_COLORS[u.mutation] : null;
        return (
          <div key={i} className="ug-card">
            <div className="ug-name" style={{ color: rc }}>{u.name}</div>
            <div className="ug-meta">
              <span className="ug-badge" style={{ background: rc + "20", color: rc, border: `1px solid ${rc}40` }}>{u.rarity}</span>
              {u.variant && vc && (
                <span className="ug-badge" style={{ background: vc.bg, color: vc.color, border: `1px solid ${vc.border}` }}>{u.variant}</span>
              )}
              {u.variant && !vc && (
                <span className="ug-badge" style={{ background: "rgba(129,140,248,.1)", color: "var(--accent)", border: "1px solid rgba(129,140,248,.25)" }}>{u.variant}</span>
              )}
              {u.mutation && mc && (
                <span className="ug-badge" style={{ background: mc.bg, color: mc.color, border: `1px solid ${mc.border}` }}>{u.mutation}</span>
              )}
              {u.mutation && !mc && (
                <span className="ug-badge" style={{ background: "rgba(167,139,250,.1)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,.25)" }}>{u.mutation}</span>
              )}
              {u.level != null && <span className="ug-badge" style={{ background: "rgba(255,255,255,.05)", color: "var(--dim)", border: "1px solid var(--card-border)" }}>Lv.{u.level}</span>}
              <span className="ug-amount">x{u.amount}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UpgradesTab({ upgrades }: { upgrades: Record<string, number> }) {
  const entries = Object.entries(upgrades);
  if (entries.length === 0) return <div className="detail-empty">Belum ada data upgrade.</div>;
  return (
    <div className="upgrade-grid">
      {entries.map(([name, level]) => (
        <div key={name} className="upg-card">
          <span className="upg-label">{name}</span>
          <span className="upg-level">Lv. {level}</span>
        </div>
      ))}
    </div>
  );
}

function DiceTab({ dice }: { dice: string[] }) {
  if (dice.length === 0) return <div className="detail-empty">Belum ada data dice.</div>;
  return (
    <div className="dice-grid">
      {dice.map((d) => (
        <span key={d} className="dice-chip">&#x1F3B2; {d}</span>
      ))}
    </div>
  );
}

function GamepassesTab({ gamepasses }: { gamepasses: Record<string, boolean> }) {
  const entries = Object.entries(gamepasses);
  if (entries.length === 0) return <div className="detail-empty">Belum ada data gamepass.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map(([name, owned]) => (
        <div key={name} style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--card)", border: "1px solid var(--card-border)",
          borderRadius: 10, padding: "10px 14px",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: owned ? "var(--green)" : "var(--red)",
            boxShadow: owned ? "0 0 6px var(--green)" : "none",
            flexShrink: 0,
          }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{name}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: owned ? "var(--green)" : "var(--dim)" }}>
            {owned ? "OWNED" : "NOT OWNED"}
          </span>
        </div>
      ))}
    </div>
  );
}
