"use client";

import { useEffect, useState, useCallback } from "react";

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
  topUnits: { name: string; rarity: string }[];
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
  forSale?: boolean;
}

interface BackpackItem {
  name: string;
  amount: number;
  kind: string;
  rarity: string;
  slot?: string | null;
  tier?: string | number | null;
  image?: number | string | null;
}

interface ADDetail {
  ownedDice: string[];
  upgrades: Record<string, number>;
  gamepasses: Record<string, boolean>;
  topUnits: { name: string; rarity: string }[];
  allUnits: { name: string; rarity: string }[];
  backpack: BackpackItem[];
  slots: unknown[];
  towerSquad: unknown;
  upgradesList: string[];
  unitsCount: number;
  unitTypesCount: number;
  discoveredCount: number;
  slotsCount: number;
  totalItemCount: number;
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

interface CombinedDetail {
  account: string;
  data: ADDetail;
}

interface CombinedState {
  open: boolean;
  loading: boolean;
  details: CombinedDetail[];
}

export default function AnimeDicePage() {
  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<ADAccount[]>([]);
  const [sortMode, setSortMode] = useState("default");
  const [tabMode, setTabMode] = useState<TabMode>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<{ name: string; data: ADDetail | null; loading: boolean; account: ADAccount | null } | null>(null);
  const [combined, setCombined] = useState<CombinedState>({ open: false, loading: false, details: [] });

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
      case "rebirth": sorted.sort((a, b) => (Number(b.rebirth) || 0) - (Number(a.rebirth) || 0)); break;
      case "rolls": sorted.sort((a, b) => (Number(b.rolls) || 0) - (Number(a.rolls) || 0)); break;
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
    return list.filter((a) => a.sourceAccount.toLowerCase().includes(q));
  }

  const filtered = filterAccounts(accounts);
  const allOnline = filtered.filter((a) => a.online);
  const allOffline = filtered.filter((a) => !a.online);
  const displayed = sortAccounts(
    tabMode === "online" ? allOnline : tabMode === "offline" ? allOffline : filtered
  );

  const totalRebirths = allOnline.reduce((s, a) => s + (Number(a.rebirth) || 0), 0);
  const totalRolls = allOnline.reduce((s, a) => s + (Number(a.rolls) || 0), 0);

  async function openCombined() {
    setCombined({ open: true, loading: true, details: [] });
    try {
      const res = await fetch("/api/anime-dice/all-details");
      const body = await res.json();
      if (res.ok && body.ok) {
        setCombined((prev) => ({ ...prev, loading: false, details: body.details || [] }));
      } else {
        setCombined((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setCombined((prev) => ({ ...prev, loading: false }));
    }
  }

  async function openDetail(name: string) {
    const acc = accounts.find((a) => a.sourceAccount === name) || null;
    setDetail({ name, data: null, loading: true, account: acc });
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

        .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .topbar h1 { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink); }

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

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }

        /* Combined card */
        .combined { background: linear-gradient(135deg, rgba(34,211,238,.04), rgba(139,92,246,.04)), var(--card); border: 1px solid rgba(34,211,238,.15); border-radius: 16px; padding: 20px; cursor: pointer; transition: all .15s; }
        .combined:hover { border-color: rgba(34,211,238,.35); transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(34,211,238,.2), 0 8px 24px rgba(0,0,0,.3); }
        .comb-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .comb-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--accent)); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
        .comb-info { flex: 1; }
        .comb-name { font-size: 16px; font-weight: 900; color: var(--ink); }
        .comb-sub { font-size: 11px; color: var(--dim); margin-top: 2px; }
        .comb-badge { font-size: 9px; font-weight: 900; padding: 4px 10px; border-radius: 6px; background: rgba(34,211,238,.12); color: var(--cyan); border: 1px solid rgba(34,211,238,.25); letter-spacing: .5px; }
        .comb-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .comb-stat .cs-label { font-size: 10px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
        .comb-stat .cs-value { font-size: 22px; font-weight: 900; margin-top: 2px; }
        .comb-footer { display: flex; align-items: center; justify-content: space-between; }
        .comb-footer-link { font-size: 11px; font-weight: 700; color: var(--cyan); display: flex; align-items: center; gap: 6px; }

        /* Account card */
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

        .acard-main { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
        .acard-stat .as-label { font-size: 10px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .3px; }
        .acard-stat .as-value { font-size: 20px; font-weight: 900; margin-top: 2px; }

        .acard-footer { display: flex; align-items: center; gap: 6px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.04); }
        .acard-footer-link { font-size: 11px; font-weight: 700; color: var(--cyan); display: flex; align-items: center; gap: 6px; flex: 1; }
        .acard-footer-arrow { margin-left: auto; color: var(--dim); font-size: 16px; }

        .empty { color: var(--dim); text-align: center; padding: 80px 0; font-size: 14px; }

        /* Modal */
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

        .modal-body { padding: 20px 24px; max-height: 60vh; overflow-y: auto; }
        .detail-empty { color: var(--dim); font-size: 13px; padding: 30px 0; text-align: center; }

        .modal-account-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: var(--card); border-bottom: 1px solid rgba(255,255,255,.04); gap: 12px; flex-wrap: wrap; }
        .mab-left { display: flex; align-items: center; gap: 10px; }
        .mab-name { font-size: 15px; font-weight: 900; color: var(--ink); }
        .mab-status { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 5px; }
        .mab-status.on { background: rgba(52,211,153,.12); color: var(--green); }
        .mab-status.off { background: rgba(239,68,68,.1); color: var(--red); }
        .mab-stats { display: flex; gap: 16px; }
        .mab-stat { font-size: 13px; font-weight: 800; display: flex; gap: 6px; }
        .mab-sl { font-size: 10px; font-weight: 700; color: var(--dim); text-transform: uppercase; }
        .mh-count { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: rgba(34,211,238,.12); color: var(--cyan); margin-left: 10px; letter-spacing: .5px; }

        /* Backpack items */
        .bp-cats { display: flex; gap: 0; flex-wrap: wrap; }
        .bp-cat { padding: 6px 14px; font-size: 11px; font-weight: 800; cursor: pointer; color: var(--dim); background: none; border: none; border-radius: 16px; transition: all .15s; }
        .bp-cat:hover { color: var(--ink); }
        .bp-cat.active { background: var(--accent); color: #0b0b14; }
        .bp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .bp-card { background: var(--card); border: 1px solid #1e1e38; border-radius: 10px; padding: 12px 14px; transition: border-color .15s; }
        .bp-card:hover { border-color: #2a2a50; }
        .bp-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .bp-name { font-size: 13px; font-weight: 700; color: var(--ink); }
        .bp-amount { font-size: 12px; font-weight: 800; color: var(--dim); background: rgba(255,255,255,.04); padding: 2px 8px; border-radius: 4px; }
        .bp-kind { font-size: 11px; font-weight: 600; }

        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 6px; }
        .section-header > span:first-child { font-size: 12px; font-weight: 800; color: var(--accent); letter-spacing: .5px; text-transform: uppercase; }
      `}</style>

      <div className="ad">
        <div className="topbar">
          <h1>Anime Dice Dashboard</h1>
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
              <option value="rebirth">REBIRTH (HIGH - LOW)</option>
              <option value="rolls">ROLLS (HIGH - LOW)</option>
            </select>
            <input className="search-input" type="text" placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {displayed.length === 0 && accounts.length === 0 ? (
          <div className="empty">Belum ada akun Anime Dice yang lapor. Pastikan script sudah jalan dan POST ke /api/anime-dice/monitor.</div>
        ) : displayed.length === 0 ? (
          <div className="empty">Tidak ada akun yang cocok dengan filter.</div>
        ) : (
          <div className="grid">
            <CombinedCard
              totalRebirths={totalRebirths}
              totalRolls={totalRolls}
              onlineCount={allOnline.length}
              totalCount={filtered.length}
              onClick={openCombined}
            />
            {displayed.map((a) => (
              <AccountCard key={a.sourceAccount} account={a} onOpen={openDetail} />
            ))}
          </div>
        )}

        {detail && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setDetail(null); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <DetailModal detail={detail} onClose={() => setDetail(null)} />
            </div>
          </div>
        )}

        {combined.open && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setCombined((p) => ({ ...p, open: false })); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <CombinedModal combined={combined} accounts={accounts} onClose={() => setCombined((p) => ({ ...p, open: false }))} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CombinedCard({ totalRebirths, totalRolls, onlineCount, totalCount, onClick }: {
  totalRebirths: number; totalRolls: number; onlineCount: number; totalCount: number; onClick: () => void;
}) {
  return (
    <div className="combined" onClick={onClick}>
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
          <div className="cs-label">Total Rebirths</div>
          <div className="cs-value" style={{ color: "var(--accent2)" }}>{fmtNum(totalRebirths)}</div>
        </div>
        <div className="comb-stat">
          <div className="cs-label">Total Rolls</div>
          <div className="cs-value" style={{ color: "var(--accent)" }}>{fmtNum(totalRolls)}</div>
        </div>
      </div>
      <div className="comb-footer">
        <span className="comb-footer-link">Click to see combined items &amp; gears <span>&#x2192;</span></span>
      </div>
    </div>
  );
}

function AccountCard({ account: a, onOpen }: { account: ADAccount; onOpen: (name: string) => void }) {
  const isOff = !a.online;

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
      </div>

      <div className="acard-main">
        <div className="acard-stat">
          <div className="as-label">Rebirth</div>
          <div className="as-value" style={{ color: "var(--accent2)" }}>R{a.rebirth ?? 0}</div>
        </div>
        <div className="acard-stat" style={{ textAlign: "right" }}>
          <div className="as-label">Rolls</div>
          <div className="as-value" style={{ color: "var(--accent)" }}>{fmtNum(a.rolls)}</div>
        </div>
      </div>

      <div className="acard-footer">
        <span className="acard-footer-link">View items &amp; gears</span>
        <span className="acard-footer-arrow">&#x2192;</span>
      </div>
    </div>
  );
}

function DetailModal({ detail, onClose }: {
  detail: { name: string; data: ADDetail | null; loading: boolean; account: ADAccount | null };
  onClose: () => void;
}) {
  const acc = detail.account;
  const d = detail.data;
  const isOnline = acc?.online ?? false;

  return (
    <>
      <div className="modal-head">
        <div className="mh-avatar">
          {(detail.name || "?")[0].toUpperCase()}
          <span className={`mh-dot ${isOnline ? "on" : "off"}`} />
        </div>
        <div className="mh-info">
          <div className="mh-name">
            {detail.name}
            {d && <span className="mh-count">{d.backpack?.length || 0} ITEMS</span>}
          </div>
          <div className="mh-sub">Items &amp; Gears</div>
        </div>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      {detail.loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Loading...</div>
      ) : !d ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>No detail data available.</div>
      ) : (
        <>
          <div className="modal-account-bar">
            <div className="mab-left">
              <span className="mab-name">{detail.name}</span>
              <span className={`mab-status ${isOnline ? "on" : "off"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span>
            </div>
            <div className="mab-stats">
              <span className="mab-stat"><span className="mab-sl">Rebirth</span> <span style={{ color: "var(--accent2)" }}>R{acc?.rebirth ?? 0}</span></span>
              <span className="mab-stat"><span className="mab-sl">Rolls</span> <span style={{ color: "var(--accent)" }}>{fmtNum(acc?.rolls)}</span></span>
            </div>
          </div>

          <div className="modal-body">
            <BackpackTab items={d.backpack || []} />
          </div>
        </>
      )}
    </>
  );
}

function CombinedModal({ combined, accounts, onClose }: {
  combined: CombinedState;
  accounts: ADAccount[];
  onClose: () => void;
}) {
  const onlineCount = accounts.filter((a) => a.online).length;

  const allBackpack: (BackpackItem & { owner: string })[] = [];
  for (const d of combined.details) {
    for (const b of (d.data.backpack || [])) allBackpack.push({ ...b, owner: d.account });
  }

  return (
    <>
      <div className="modal-head">
        <div className="mh-avatar" style={{ background: "linear-gradient(135deg, var(--cyan), var(--accent))" }}>
          <span style={{ fontSize: 20 }}>&#x1F465;</span>
        </div>
        <div className="mh-info">
          <div className="mh-name">
            ALL ACCOUNTS
            <span className="mh-count">{allBackpack.length} ITEMS</span>
          </div>
          <div className="mh-sub">{onlineCount} of {accounts.length} online &mdash; combined items &amp; gears.</div>
        </div>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      {combined.loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Loading all account details...</div>
      ) : combined.details.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>No detail data available.</div>
      ) : (
        <>
          <div className="modal-stats">
            <div className="ms"><div className="ms-l">Accounts</div><div className="ms-v" style={{ color: "var(--cyan)" }}>{combined.details.length}</div></div>
            <div className="ms"><div className="ms-l">Total Items</div><div className="ms-v" style={{ color: "var(--accent)" }}>{allBackpack.length}</div></div>
          </div>

          <div className="modal-body">
            <CombinedBackpackTab items={allBackpack} />
          </div>
        </>
      )}
    </>
  );
}

const BACKPACK_CATEGORIES: Record<string, string> = {
  Currency: "Currencies",
  "Damage Potion": "Boost",
  "Income Potion": "Boost",
  "Luck Potion": "Boost",
  "Reroll Potion": "Rerolls",
};

function getCategory(kind: string): string {
  return BACKPACK_CATEGORIES[kind] || kind;
}

const BACKPACK_SORT_ORDER: string[] = [
  "Gems", "Trait Reroll", "Ticket", "Jackpot Point", "Lucky Spin",
  "Star Fragment", "Rebirth Token", "Auto Roll Ticket",
];

function backpackSortKey(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < BACKPACK_SORT_ORDER.length; i++) {
    if (lower.includes(BACKPACK_SORT_ORDER[i].toLowerCase())) return i;
  }
  return BACKPACK_SORT_ORDER.length;
}

function parseBoostLevel(name: string): { base: string; level: number; roman: string } | null {
  const m = name.match(/^(.+)\s+(IV|III|II|I|V)$/);
  if (!m) return null;
  const romanToNum: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  const level = romanToNum[m[2]];
  if (!level) return null;
  return { base: m[1].trim(), level, roman: m[2] };
}

function isBoostItem(it: BackpackItem): boolean {
  return it.kind.includes("Potion") && it.kind !== "Reroll Potion" && parseBoostLevel(it.name) !== null;
}

function fmtBoostVal(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return v.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function BackpackTab({ items }: { items: BackpackItem[] }) {
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState("All");

  const categories = ["All", ...Array.from(new Set(items.map((it) => getCategory(it.kind)))).sort()];

  const filtered = items.filter((it) => {
    if (cat !== "All" && getCategory(it.kind) !== cat) return false;
    if (filter.trim() && !it.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  }).sort((a, b) => backpackSortKey(a.name) - backpackSortKey(b.name));

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <input className="search-input" style={{ width: 220 }} placeholder="Search items, gears..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="bp-cats">
          {categories.map((c) => (
            <button key={c} className={`bp-cat ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
              {c === "All" ? `All (${items.length})` : c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="bp-grid">
          {filtered.map((it, i) => (
            <div key={i} className="bp-card">
              <div className="bp-top">
                <span className="bp-name">{it.name}</span>
                <span className="bp-amount">x{it.amount.toLocaleString()}</span>
              </div>
              <span className="bp-kind" style={{ color: rarityColor(it.rarity) }}>{getCategory(it.kind)}{it.slot ? ` · ${it.slot}` : ""}</span>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="detail-empty">No item data available.</div>
      ) : (
        <div className="detail-empty">No items match your filter.</div>
      )}
    </>
  );
}

function CombinedBackpackTab({ items }: { items: (BackpackItem & { owner: string })[] }) {
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState("All");
  const [mode, setMode] = useState<"summary" | "list">("summary");
  const [boostHighest, setBoostHighest] = useState(true);
  const [gearDivine, setGearDivine] = useState(false);

  const categories = ["All", ...Array.from(new Set(items.map((it) => getCategory(it.kind)))).sort()];

  const filtered = items.filter((it) => {
    if (cat !== "All" && getCategory(it.kind) !== cat) return false;
    if (filter.trim() && !it.name.toLowerCase().includes(filter.toLowerCase()) && !it.owner.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });
  const filteredList = [...filtered].sort((a, b) => backpackSortKey(a.name) - backpackSortKey(b.name));

  const aggMap = new Map<string, { name: string; rarity: string; kind: string; slot?: string | null; total: number; owners: Set<string> }>();
  filtered.forEach((it) => {
    const key = it.name;
    const prev = aggMap.get(key);
    if (prev) {
      prev.total += it.amount || 0;
      prev.owners.add(it.owner);
    } else {
      aggMap.set(key, {
        name: it.name,
        rarity: it.rarity,
        kind: it.kind,
        slot: it.slot,
        total: it.amount || 0,
        owners: new Set([it.owner]),
      });
    }
  });

  const byKind = new Map<string, typeof aggMap extends Map<string, infer V> ? V[] : never>();
  aggMap.forEach((v) => {
    const g = getCategory(v.kind);
    const arr = byKind.get(g) || [];
    arr.push(v);
    byKind.set(g, arr);
  });
  const kindEntries = Array.from(byKind.entries()).map(([k, arr]) => {
    let items = [...arr];
    if (k === "Boost" && boostHighest) {
      const maxLvl = new Map<string, number>();
      for (const it of items) {
        const p = parseBoostLevel(it.name);
        if (p) maxLvl.set(p.base, Math.max(maxLvl.get(p.base) || 0, p.level));
      }
      items = items.filter(it => {
        const p = parseBoostLevel(it.name);
        return !p || p.level >= (maxLvl.get(p.base) || 0);
      });
    }
    if (k === "Gear" && gearDivine) {
      items = items.filter(it => it.rarity === "Divine");
    }
    items.sort((a, b) => b.total - a.total);
    return { kind: k, items, totalItems: items.reduce((s, x) => s + x.total, 0) };
  }).filter(e => e.items.length > 0).sort((a, b) => b.totalItems - a.totalItems);

  const showBoostFilter = cat === "All" || cat === "Boost";
  const showGearFilter = cat === "All" || cat === "Gear";

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div className="pill-tabs">
          <button className={`ptab ${mode === "summary" ? "active" : ""}`} onClick={() => setMode("summary")}>FLEET SUMMARY</button>
          <button className={`ptab ${mode === "list" ? "active" : ""}`} onClick={() => setMode("list")}>PER OWNER</button>
        </div>
        <input className="search-input" style={{ width: 220 }} placeholder={mode === "summary" ? "Search items..." : "Search items, accounts..."} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="bp-cats">
          {categories.map((c) => (
            <button key={c} className={`bp-cat ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
              {c === "All" ? `All (${items.length})` : c}
            </button>
          ))}
        </div>
      </div>
      {mode === "summary" && (showBoostFilter || showGearFilter) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {showBoostFilter && (
            <button
              onClick={() => setBoostHighest(!boostHighest)}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: 800, cursor: "pointer", borderRadius: 16, border: boostHighest ? "1px solid rgba(251,191,36,.35)" : "1px solid #222240", background: boostHighest ? "rgba(251,191,36,.12)" : "transparent", color: boostHighest ? "var(--gold)" : "var(--dim)", transition: "all .15s" }}
            >
              Highest Level Only
            </button>
          )}
          {showGearFilter && (
            <button
              onClick={() => setGearDivine(!gearDivine)}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: 800, cursor: "pointer", borderRadius: 16, border: gearDivine ? "1px solid rgba(168,85,247,.35)" : "1px solid #222240", background: gearDivine ? "rgba(168,85,247,.12)" : "transparent", color: gearDivine ? "var(--accent2)" : "var(--dim)", transition: "all .15s" }}
            >
              Divine Only
            </button>
          )}
        </div>
      )}

      {mode === "summary" ? (
        kindEntries.length === 0 ? (
          <div className="detail-empty">{items.length === 0 ? "No item data available." : "No items match your filter."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {kindEntries.map((grp) => (
              <div key={grp.kind}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  {grp.kind}
                  <span style={{ background: "rgba(129,140,248,.1)", color: "var(--accent)", padding: "2px 8px", borderRadius: 4, fontSize: 9 }}>{grp.items.length} tipe · {grp.totalItems.toLocaleString()} total</span>
                </div>
                <div className="bp-grid">
                  {grp.items.map((it, i) => (
                    <div key={i} className="bp-card">
                      <div className="bp-top">
                        <span className="bp-name">{it.name}</span>
                        <span className="bp-amount" style={{ background: "rgba(52,211,153,.1)", color: "var(--green)" }}>×{it.total.toLocaleString()}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="bp-kind" style={{ color: rarityColor(it.rarity) }}>{it.rarity} · {(() => { const p = parseBoostLevel(it.name); return p ? p.base : (it.slot || grp.kind); })()}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--cyan)" }}>{it.owners.size} akun</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredList.length > 0 ? (
        <div className="bp-grid">
          {filteredList.map((it, i) => (
            <div key={i} className="bp-card">
              <div className="bp-top">
                <span className="bp-name">{it.name}</span>
                <span className="bp-amount">x{it.amount.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="bp-kind" style={{ color: rarityColor(it.rarity) }}>{getCategory(it.kind)}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--cyan)" }}>@{it.owner}</span>
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="detail-empty">No item data available.</div>
      ) : (
        <div className="detail-empty">No items match your filter.</div>
      )}
    </>
  );
}
