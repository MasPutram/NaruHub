"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Unit {
  name: string;
  rarity: string;
  variant: string | null;
  mutation: string | null;
  level: number | null;
  amount: number;
  trait?: string | null;
  grade?: string | null;
  locked?: boolean | null;
  income?: number | null;
  damage?: number | null;
  chance?: number | null;
  health?: number | null;
  placed?: "slot" | "tower" | null;
}

interface BackpackItem {
  name: string;
  amount: number;
  kind: string;
  rarity: string;
}

interface ADDetail {
  ownedDice: string[];
  upgrades: Record<string, number>;
  gamepasses: Record<string, boolean>;
  topUnits: Unit[];
  allUnits: Unit[];
  backpack: BackpackItem[];
  slots: any[];
  towerSquad: { squad: any[]; equipped: any | null };
  upgradesList: string[];
  unitsCount: number;
  unitTypesCount: number;
  discoveredCount: number;
  slotsCount: number;
  totalItemCount: number;
}

interface Rates {
  unitRate: number;
  gemRate: number;
  traitRerollRate: number;
  luckySpinRate: number;
  jackpotRate: number;
  gearRate: number;
}

const DEFAULT_RATES: Rates = {
  unitRate: 0,
  gemRate: 0,
  traitRerollRate: 0,
  luckySpinRate: 0,
  jackpotRate: 0,
  gearRate: 0,
};

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

const RARITY_ORDER = [
  "Exclusive", "Secret II", "Heavenly", "Secret I", "Celestial",
  "Exotic", "Divine", "Mythical", "Legendary", "Epic", "Rare", "Uncommon", "Common",
];

function rarityColor(r: string): string { return RARITY_COLORS[r] || "#71717a"; }

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

function fmtPrice(v: number): string {
  if (v === 0) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e15) return (v / 1e15).toFixed(2) + "qa";
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + "t";
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + "b";
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "m";
  if (abs >= 1e3) return (v / 1e3).toFixed(2) + "k";
  return v.toFixed(0);
}

const STOCK_ACCOUNT = "KaijuBer2";

type ViewTab = "units" | "backpack";

export default function InventoryPage() {
  const [mounted, setMounted] = useState(false);
  const [detail, setDetail] = useState<ADDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [tab, setTab] = useState<ViewTab>("units");
  const [unitSearch, setUnitSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("All");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [detailRes, ratesRes] = await Promise.all([
        fetch("/api/anime-dice/account-detail?account=" + encodeURIComponent(STOCK_ACCOUNT)),
        fetch("/api/anime-dice/inventory-rates"),
      ]);
      const detailBody = await detailRes.json();
      const ratesBody = await ratesRes.json();
      if (detailRes.ok && detailBody.ok) setDetail(detailBody);
      if (ratesRes.ok && ratesBody.ok && ratesBody.rates) {
        setRates({ ...DEFAULT_RATES, ...ratesBody.rates });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  function updateRate(key: keyof Rates, val: string) {
    const num = parseFloat(val) || 0;
    const next = { ...rates, [key]: num };
    setRates(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/anime-dice/inventory-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: next }),
      }).catch(() => {});
    }, 800);
  }

  if (!mounted) return null;

  const units = (detail?.allUnits || []).filter((u) => u.chance != null && u.chance > 0);
  const sortedUnits = [...units].sort((a, b) => {
    const ra = RARITY_ORDER.indexOf(a.rarity);
    const rb = RARITY_ORDER.indexOf(b.rarity);
    if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
    return (b.chance || 0) - (a.chance || 0);
  });

  const filteredUnits = sortedUnits.filter((u) => {
    if (rarityFilter !== "All" && u.rarity !== rarityFilter) return false;
    if (unitSearch.trim()) {
      const q = unitSearch.toLowerCase();
      const fullName = ((u.variant || "") + " " + u.name).toLowerCase();
      if (!fullName.includes(q) && !u.rarity.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const availableRarities = Array.from(new Set(sortedUnits.map((u) => u.rarity)));

  const backpack = detail?.backpack || [];
  const gems = backpack.find((b) => b.name.toLowerCase().includes("gem"));
  const traitReroll = backpack.find((b) => b.name.toLowerCase().includes("trait reroll"));
  const luckySpin = backpack.find((b) => b.name.toLowerCase().includes("lucky spin"));
  const jackpot = backpack.find((b) => b.name.toLowerCase().includes("jackpot"));
  const gearItems = backpack.filter((b) => b.name.toLowerCase().includes("gear"));
  const divineGearCount = gearItems
    .filter((g) => g.rarity?.toLowerCase() === "divine")
    .reduce((s, g) => s + (g.amount || 0), 0);

  const gemValue = (gems?.amount || 0) / 1000 * rates.gemRate;
  const traitValue = (traitReroll?.amount || 0) / 1000 * rates.traitRerollRate;
  const luckySpinValue = (luckySpin?.amount || 0) * rates.luckySpinRate;
  const jackpotValue = (jackpot?.amount || 0) * rates.jackpotRate;
  const gearValue = divineGearCount * rates.gearRate;
  const fleetSum = gemValue + traitValue + luckySpinValue + jackpotValue + gearValue;

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b14; --surface: #111120; --card: #15152a; --card-hover: #1a1a35;
          --ink: #e8e8f0; --dim: #555570; --accent: #818cf8; --accent2: #a855f7;
          --green: #34d399; --gold: #fbbf24; --red: #ef4444; --cyan: #22d3ee;
          --purple: #c084fc;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inv { max-width: 1400px; margin: 0 auto; padding: 20px 24px 40px; font-family: 'Inter', system-ui, -apple-system, sans-serif; }

        .inv-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
        .inv-topbar h1 { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink); }
        .inv-badge { font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 6px; background: rgba(192,132,252,.12); color: var(--purple); border: 1px solid rgba(192,132,252,.25); letter-spacing: .5px; }

        /* Fleet sum banner */
        .fleet-banner { background: linear-gradient(135deg, rgba(52,211,153,.06), rgba(129,140,248,.06)), var(--card); border: 1px solid rgba(52,211,153,.2); border-radius: 16px; padding: 20px 24px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
        .fleet-label { font-size: 11px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; }
        .fleet-value { font-size: 32px; font-weight: 900; color: var(--green); margin-top: 4px; }
        .fleet-items { display: flex; gap: 16px; flex-wrap: wrap; }
        .fleet-item { text-align: center; min-width: 90px; }
        .fi-label { font-size: 9px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
        .fi-value { font-size: 16px; font-weight: 900; color: var(--cyan); margin-top: 2px; }
        .fi-sub { font-size: 10px; color: var(--dim); font-weight: 600; margin-top: 1px; }

        /* Rate settings */
        .rates-toggle { background: var(--surface); border: 1px solid #222240; color: var(--ink); font-size: 12px; font-weight: 700; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all .15s; }
        .rates-toggle:hover { border-color: var(--accent); }
        .rates-panel { background: var(--card); border: 1px solid #1e1e38; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
        .rates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .rate-field { }
        .rate-label { font-size: 10px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
        .rate-sublabel { font-size: 9px; color: #444460; font-weight: 600; }
        .rate-input { width: 100%; background: var(--surface); border: 1px solid #222240; color: var(--ink); font-size: 14px; font-weight: 700; padding: 10px 12px; border-radius: 8px; }
        .rate-input:focus { outline: none; border-color: var(--accent); }
        .rate-input::placeholder { color: #333350; }

        /* Tabs */
        .inv-controls { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .inv-tabs { display: flex; gap: 0; }
        .inv-tab { padding: 8px 18px; font-size: 12px; font-weight: 800; cursor: pointer; color: var(--dim); background: none; border: none; transition: all .15s; border-radius: 20px; }
        .inv-tab:hover { color: var(--ink); }
        .inv-tab.active { background: var(--accent); color: #0b0b14; }
        .inv-search { background: var(--surface); color: var(--ink); border: 1px solid #222240; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; width: 200px; margin-left: auto; }
        .inv-search:focus { outline: none; border-color: var(--accent); }
        .inv-search::placeholder { color: var(--dim); }

        /* Rarity filter pills */
        .rarity-pills { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; }
        .rp { font-size: 10px; font-weight: 800; padding: 5px 12px; border-radius: 14px; cursor: pointer; border: 1px solid #222240; background: none; color: var(--dim); transition: all .12s; }
        .rp:hover { color: var(--ink); border-color: #333350; }
        .rp.active { background: var(--accent); color: #0b0b14; border-color: var(--accent); }

        /* Unit grid */
        .ugrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
        .ucard { background: var(--card); border: 1px solid #1e1e38; border-radius: 12px; padding: 14px 16px; transition: border-color .15s; }
        .ucard:hover { border-color: #2a2a50; }
        .ucard-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .ucard-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; flex-shrink: 0; }
        .ucard-info { flex: 1; min-width: 0; }
        .ucard-name { font-size: 14px; font-weight: 800; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ucard-rarity { font-size: 10px; font-weight: 800; letter-spacing: .3px; }
        .ucard-amount { font-size: 11px; font-weight: 800; color: var(--dim); background: rgba(255,255,255,.04); padding: 3px 8px; border-radius: 5px; flex-shrink: 0; }
        .ucard-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 8px; border: 1px solid rgba(255,255,255,.05); border-radius: 8px; overflow: hidden; }
        .ucard-stat { padding: 8px 10px; background: rgba(255,255,255,.015); }
        .ucard-stat:first-child { border-right: 1px solid rgba(255,255,255,.05); }
        .ucs-label { font-size: 9px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .4px; }
        .ucs-value { font-size: 14px; font-weight: 900; margin-top: 2px; }
        .ucard-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        .utag { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 4px; letter-spacing: .3px; }

        /* Backpack cards */
        .bp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
        .bp-card { background: var(--card); border: 1px solid #1e1e38; border-radius: 14px; padding: 18px; transition: border-color .15s; }
        .bp-card:hover { border-color: #2a2a50; }
        .bp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .bp-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .bp-info { flex: 1; }
        .bp-name { font-size: 15px; font-weight: 800; color: var(--ink); }
        .bp-sub { font-size: 11px; color: var(--dim); font-weight: 600; margin-top: 2px; }
        .bp-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid rgba(255,255,255,.04); }
        .bp-rl { font-size: 11px; font-weight: 700; color: var(--dim); }
        .bp-rv { font-size: 15px; font-weight: 900; }
        .bp-rv.green { color: var(--green); }
        .bp-rv.cyan { color: var(--cyan); }
        .bp-rv.gold { color: var(--gold); }
        .bp-rv.purple { color: var(--purple); }

        /* Gear sub-table */
        .gear-list { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .gear-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,.02); border-radius: 6px; }
        .gear-name { font-size: 12px; font-weight: 700; color: var(--ink); flex: 1; }
        .gear-rarity { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
        .gear-amount { font-size: 12px; font-weight: 800; color: var(--dim); margin-left: 8px; }

        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }
        .loading { color: var(--dim); text-align: center; padding: 80px 0; font-size: 14px; }

        .section-title { font-size: 11px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
        .count-badge { font-size: 10px; font-weight: 800; color: var(--cyan); background: rgba(34,211,238,.1); padding: 3px 10px; border-radius: 5px; margin-left: 8px; }
      `}</style>

      <div className="inv">
        <div className="inv-topbar">
          <h1>Inventory Panel — {STOCK_ACCOUNT}</h1>
          <span className="inv-badge">STOCK ACCOUNT</span>
        </div>

        {loading ? (
          <div className="loading">Memuat data {STOCK_ACCOUNT}...</div>
        ) : !detail ? (
          <div className="empty">Belum ada data untuk {STOCK_ACCOUNT}. Pastikan akun sedang online dan melapor.</div>
        ) : (
          <>
            {/* Fleet Sum Banner */}
            <div className="fleet-banner">
              <div>
                <div className="fleet-label">Fleet Sum (Backpack Value)</div>
                <div className="fleet-value">{fleetSum > 0 ? fmtPrice(fleetSum) : "Set rates below"}</div>
              </div>
              <div className="fleet-items">
                <div className="fleet-item">
                  <div className="fi-label">Gems</div>
                  <div className="fi-value">{gemValue > 0 ? fmtPrice(gemValue) : "-"}</div>
                  <div className="fi-sub">{fmtNum(gems?.amount || 0)} pcs</div>
                </div>
                <div className="fleet-item">
                  <div className="fi-label">Trait Reroll</div>
                  <div className="fi-value">{traitValue > 0 ? fmtPrice(traitValue) : "-"}</div>
                  <div className="fi-sub">{fmtNum(traitReroll?.amount || 0)} pcs</div>
                </div>
                <div className="fleet-item">
                  <div className="fi-label">Lucky Spin</div>
                  <div className="fi-value">{luckySpinValue > 0 ? fmtPrice(luckySpinValue) : "-"}</div>
                  <div className="fi-sub">{fmtNum(luckySpin?.amount || 0)} pcs</div>
                </div>
                <div className="fleet-item">
                  <div className="fi-label">Jackpot</div>
                  <div className="fi-value">{jackpotValue > 0 ? fmtPrice(jackpotValue) : "-"}</div>
                  <div className="fi-sub">{fmtNum(jackpot?.amount || 0)} pcs</div>
                </div>
                <div className="fleet-item">
                  <div className="fi-label">Gear (Divine)</div>
                  <div className="fi-value">{gearValue > 0 ? fmtPrice(gearValue) : "-"}</div>
                  <div className="fi-sub">{fmtNum(divineGearCount)} pcs</div>
                </div>
              </div>
            </div>

            {/* Rate Settings */}
            <div style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
              <button className="rates-toggle" onClick={() => setRatesOpen(!ratesOpen)}>
                {ratesOpen ? "Hide" : "Show"} Rate Settings
              </button>
              {!ratesOpen && fleetSum > 0 && (
                <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600 }}>
                  Rates configured — click to edit
                </span>
              )}
            </div>

            {ratesOpen && (
              <div className="rates-panel">
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)", marginBottom: 14, letterSpacing: ".5px" }}>
                  RATE SETTINGS
                </div>
                <div className="rates-grid">
                  <div className="rate-field">
                    <div className="rate-label">Rate Gem <span className="rate-sublabel">/ 1k gems</span></div>
                    <input className="rate-input" type="number" step="any" placeholder="0"
                      value={rates.gemRate || ""} onChange={(e) => updateRate("gemRate", e.target.value)} />
                  </div>
                  <div className="rate-field">
                    <div className="rate-label">Rate Trait Reroll <span className="rate-sublabel">/ 1k pcs</span></div>
                    <input className="rate-input" type="number" step="any" placeholder="0"
                      value={rates.traitRerollRate || ""} onChange={(e) => updateRate("traitRerollRate", e.target.value)} />
                  </div>
                  <div className="rate-field">
                    <div className="rate-label">Rate Lucky Spin <span className="rate-sublabel">/ pc</span></div>
                    <input className="rate-input" type="number" step="any" placeholder="0"
                      value={rates.luckySpinRate || ""} onChange={(e) => updateRate("luckySpinRate", e.target.value)} />
                  </div>
                  <div className="rate-field">
                    <div className="rate-label">Rate Jackpot <span className="rate-sublabel">/ pc</span></div>
                    <input className="rate-input" type="number" step="any" placeholder="0"
                      value={rates.jackpotRate || ""} onChange={(e) => updateRate("jackpotRate", e.target.value)} />
                  </div>
                  <div className="rate-field">
                    <div className="rate-label">Rate Gear <span className="rate-sublabel">/ divine gear</span></div>
                    <input className="rate-input" type="number" step="any" placeholder="0"
                      value={rates.gearRate || ""} onChange={(e) => updateRate("gearRate", e.target.value)} />
                  </div>
                  <div className="rate-field">
                    <div className="rate-label">Rate Unit <span className="rate-sublabel">/ 1sx chance</span></div>
                    <input className="rate-input" type="number" step="any" placeholder="0"
                      value={rates.unitRate || ""} onChange={(e) => updateRate("unitRate", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Tab controls */}
            <div className="inv-controls">
              <div className="inv-tabs">
                <button className={`inv-tab ${tab === "units" ? "active" : ""}`} onClick={() => setTab("units")}>
                  UNITS ({sortedUnits.length})
                </button>
                <button className={`inv-tab ${tab === "backpack" ? "active" : ""}`} onClick={() => setTab("backpack")}>
                  BACKPACK
                </button>
              </div>
              {tab === "units" && (
                <input className="inv-search" type="text" placeholder="Search units..." value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)} />
              )}
            </div>

            {tab === "units" && (
              <>
                <div className="rarity-pills">
                  <button className={`rp ${rarityFilter === "All" ? "active" : ""}`} onClick={() => setRarityFilter("All")}>ALL</button>
                  {availableRarities.map((r) => (
                    <button key={r} className={`rp ${rarityFilter === r ? "active" : ""}`}
                      style={rarityFilter === r ? {} : { borderColor: rarityColor(r) + "40", color: rarityColor(r) }}
                      onClick={() => setRarityFilter(r)}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>

                {filteredUnits.length === 0 ? (
                  <div className="empty">Tidak ada unit dengan data chance.</div>
                ) : (
                  <div className="ugrid">
                    {filteredUnits.map((u, i) => {
                      const rc = rarityColor(u.rarity);
                      const unitPrice = rates.unitRate > 0 && u.chance
                        ? (u.chance / 1e21) * rates.unitRate * (u.amount || 1)
                        : 0;
                      return (
                        <div key={`${u.name}-${u.variant}-${u.rarity}-${i}`} className="ucard">
                          <div className="ucard-head">
                            <div className="ucard-icon" style={{ background: rc + "18", color: rc }}>
                              {u.name[0]}
                            </div>
                            <div className="ucard-info">
                              <div className="ucard-name">{u.variant ? `${u.variant} ` : ""}{u.name}</div>
                              <div className="ucard-rarity" style={{ color: rc }}>{u.rarity}</div>
                            </div>
                            {u.amount > 1 && (
                              <span className="ucard-amount">x{u.amount}</span>
                            )}
                          </div>

                          <div className="ucard-stats">
                            <div className="ucard-stat">
                              <div className="ucs-label">CHANCE</div>
                              <div className="ucs-value" style={{ color: "var(--cyan)" }}>1 in {fmtMoney(u.chance)}</div>
                            </div>
                            <div className="ucard-stat">
                              <div className="ucs-label">PRICE</div>
                              <div className="ucs-value" style={{ color: unitPrice > 0 ? "var(--green)" : "var(--dim)" }}>
                                {unitPrice > 0 ? fmtPrice(unitPrice) : "-"}
                              </div>
                            </div>
                          </div>

                          {(u.trait || u.grade || u.mutation) && (
                            <div className="ucard-tags">
                              {u.mutation && (
                                <span className="utag" style={{ background: "rgba(232,121,249,.12)", color: "#e879f9" }}>{u.mutation}</span>
                              )}
                              {u.trait && (
                                <span className="utag" style={{ background: "rgba(129,140,248,.08)", color: "var(--accent)" }}>{u.trait}</span>
                              )}
                              {u.grade && (
                                <span className="utag" style={{ background: "rgba(251,191,36,.1)", color: "var(--gold)" }}>{u.grade}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === "backpack" && (
              <div className="bp-grid">
                {/* Gems */}
                <div className="bp-card">
                  <div className="bp-head">
                    <div className="bp-icon" style={{ background: "rgba(34,211,238,.1)" }}>&#x1F48E;</div>
                    <div className="bp-info">
                      <div className="bp-name">Gems</div>
                      <div className="bp-sub">Rate: {rates.gemRate > 0 ? `${fmtPrice(rates.gemRate)} / 1k` : "Not set"}</div>
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Quantity</span>
                    <span className="bp-rv cyan">{fmtNum(gems?.amount || 0)}</span>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Value</span>
                    <span className="bp-rv green">{gemValue > 0 ? fmtPrice(gemValue) : "-"}</span>
                  </div>
                </div>

                {/* Trait Reroll */}
                <div className="bp-card">
                  <div className="bp-head">
                    <div className="bp-icon" style={{ background: "rgba(129,140,248,.1)" }}>&#x1F504;</div>
                    <div className="bp-info">
                      <div className="bp-name">Trait Reroll</div>
                      <div className="bp-sub">Rate: {rates.traitRerollRate > 0 ? `${fmtPrice(rates.traitRerollRate)} / 1k` : "Not set"}</div>
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Quantity</span>
                    <span className="bp-rv cyan">{fmtNum(traitReroll?.amount || 0)}</span>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Value</span>
                    <span className="bp-rv green">{traitValue > 0 ? fmtPrice(traitValue) : "-"}</span>
                  </div>
                </div>

                {/* Lucky Spin */}
                <div className="bp-card">
                  <div className="bp-head">
                    <div className="bp-icon" style={{ background: "rgba(251,191,36,.1)" }}>&#x1F3B0;</div>
                    <div className="bp-info">
                      <div className="bp-name">Lucky Spin</div>
                      <div className="bp-sub">Rate: {rates.luckySpinRate > 0 ? `${fmtPrice(rates.luckySpinRate)} / pc` : "Not set"}</div>
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Quantity</span>
                    <span className="bp-rv cyan">{fmtNum(luckySpin?.amount || 0)}</span>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Value</span>
                    <span className="bp-rv green">{luckySpinValue > 0 ? fmtPrice(luckySpinValue) : "-"}</span>
                  </div>
                </div>

                {/* Jackpot */}
                <div className="bp-card">
                  <div className="bp-head">
                    <div className="bp-icon" style={{ background: "rgba(239,68,68,.1)" }}>&#x1F3AF;</div>
                    <div className="bp-info">
                      <div className="bp-name">Jackpot Point</div>
                      <div className="bp-sub">Rate: {rates.jackpotRate > 0 ? `${fmtPrice(rates.jackpotRate)} / pc` : "Not set"}</div>
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Quantity</span>
                    <span className="bp-rv cyan">{fmtNum(jackpot?.amount || 0)}</span>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Value</span>
                    <span className="bp-rv green">{jackpotValue > 0 ? fmtPrice(jackpotValue) : "-"}</span>
                  </div>
                </div>

                {/* Gear */}
                <div className="bp-card" style={{ gridColumn: gearItems.length > 0 ? "1 / -1" : undefined }}>
                  <div className="bp-head">
                    <div className="bp-icon" style={{ background: "rgba(232,121,249,.1)" }}>&#x2699;&#xFE0F;</div>
                    <div className="bp-info">
                      <div className="bp-name">Gear</div>
                      <div className="bp-sub">Rate: {rates.gearRate > 0 ? `${fmtPrice(rates.gearRate)} / divine gear` : "Not set"} — Divine: {divineGearCount}</div>
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Divine Gear Count</span>
                    <span className="bp-rv purple" style={{ color: "var(--purple)" }}>{fmtNum(divineGearCount)}</span>
                  </div>
                  <div className="bp-row">
                    <span className="bp-rl">Value (Divine Only)</span>
                    <span className="bp-rv green">{gearValue > 0 ? fmtPrice(gearValue) : "-"}</span>
                  </div>
                  {gearItems.length > 0 && (
                    <div className="gear-list">
                      {gearItems.map((g, i) => (
                        <div key={i} className="gear-row">
                          <span className="gear-name">{g.name}</span>
                          <span className="gear-rarity" style={{ background: rarityColor(g.rarity) + "18", color: rarityColor(g.rarity) }}>
                            {g.rarity}
                          </span>
                          <span className="gear-amount">x{g.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Other backpack items */}
                {backpack.filter((b) => {
                  const n = b.name.toLowerCase();
                  return !n.includes("gem") && !n.includes("trait reroll") && !n.includes("lucky spin") && !n.includes("jackpot") && !n.includes("gear");
                }).length > 0 && (
                  <>
                    <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                      <div className="section-title">Other Items</div>
                    </div>
                    {backpack.filter((b) => {
                      const n = b.name.toLowerCase();
                      return !n.includes("gem") && !n.includes("trait reroll") && !n.includes("lucky spin") && !n.includes("jackpot") && !n.includes("gear");
                    }).map((b, i) => (
                      <div key={i} className="bp-card">
                        <div className="bp-head">
                          <div className="bp-icon" style={{ background: "rgba(255,255,255,.04)" }}>&#x1F4E6;</div>
                          <div className="bp-info">
                            <div className="bp-name">{b.name}</div>
                            <div className="bp-sub" style={{ color: rarityColor(b.rarity) }}>{b.rarity}</div>
                          </div>
                        </div>
                        <div className="bp-row">
                          <span className="bp-rl">Quantity</span>
                          <span className="bp-rv cyan">{fmtNum(b.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
