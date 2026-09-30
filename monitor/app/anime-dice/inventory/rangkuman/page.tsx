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
  income?: number | null;
  chance?: number | null;
  image?: number | string | null;
  colors?: string[] | null;
  modelName?: string | null;
  shirtId?: string | number | null;
}

interface BackpackItem {
  name: string;
  amount: number;
  kind: string;
  rarity: string;
  image?: number | string | null;
}

interface ADDetail {
  allUnits: Unit[];
  backpack: BackpackItem[];
}

interface UnitState { price: number; sold: boolean }
interface SewaEntry { pricePerHour: number; deposit: number }

interface InventoryState {
  unitData: Record<string, UnitState>;
  bpSold: Record<string, number>;
  sewa: Record<string, SewaEntry>;
}

interface Rates {
  gemRate: number;
  traitRerollRate: number;
  luckySpinRate: number;
  jackpotRate: number;
  gearRate: number;
}

const DEFAULT_RATES: Rates = { gemRate: 0, traitRerollRate: 0, luckySpinRate: 0, jackpotRate: 0, gearRate: 0 };
const STOCK_ACCOUNT = "KaijuBer2";
const MIN_CHANCE = 1e21;

const RARITY_COLORS: Record<string, string> = {
  Exclusive: "#ff6b6b", "Secret II": "#ff4ecf", Heavenly: "#ff4ecf",
  "Secret I": "#ff7eb3", Celestial: "#ff7eb3", Exotic: "#f472b6",
  Divine: "#e879f9", Mythical: "#a78bfa", Legendary: "#fbbf24",
  Epic: "#818cf8", Rare: "#34d399", Uncommon: "#94a3b8", Common: "#71717a",
};

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

function fmtRp(v: number): string {
  if (!v) return "Rp 0";
  return "Rp " + Math.round(v).toLocaleString("id-ID");
}

function unitKey(u: Unit): string {
  return [u.name, u.variant || "", u.rarity, u.mutation || "", u.trait || "", u.grade || ""].join("|");
}

function assetIdOf(image: number | string | null | undefined): string | null {
  if (image == null || image === "") return null;
  const s = String(image);
  const m = s.match(/(\d{5,})/);
  return m ? m[1] : null;
}

function imageUrl(image: number | string | null | undefined): string | null {
  const id = assetIdOf(image);
  if (!id) return null;
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=420&height=420&format=png`;
}

function unitPortraitUrl(u: Unit): string | null {
  return imageUrl(u.image) || imageUrl(u.shirtId);
}

function unitGradient(u: Unit): string {
  const cs = u.colors && u.colors.length > 0 ? u.colors : [rarityColor(u.rarity)];
  if (cs.length === 1) return `linear-gradient(135deg, ${cs[0]}, ${cs[0]}66)`;
  return `linear-gradient(135deg, ${cs.join(", ")})`;
}

export default function RangkumanPage() {
  const [mounted, setMounted] = useState(false);
  const [detail, setDetail] = useState<ADDetail | null>(null);
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [state, setState] = useState<InventoryState>({ unitData: {}, bpSold: {}, sewa: {} });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [owner, setOwner] = useState("Mas Naru");
  const [contact, setContact] = useState("facebook.com/naruaho");
  const posterRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [d, r, s] = await Promise.all([
        fetch("/api/anime-dice/account-detail?account=" + encodeURIComponent(STOCK_ACCOUNT)).then((x) => x.json()),
        fetch("/api/anime-dice/inventory-rates").then((x) => x.json()),
        fetch("/api/anime-dice/inventory-state").then((x) => x.json()),
      ]);
      if (d.ok) setDetail(d);
      if (r.ok && r.rates) setRates({ ...DEFAULT_RATES, ...r.rates });
      if (s.ok && s.state) setState({
        unitData: s.state.unitData || {},
        bpSold: s.state.bpSold || {},
        sewa: s.state.sewa || {},
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { setMounted(true); fetchAll(); }, [fetchAll]);

  async function downloadPoster() {
    if (!posterRef.current) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(posterRef.current, {
        scale: 2,
        backgroundColor: "#DFE7F0",
        useCORS: true,
      });
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `Rangkuman-AnimeDice-${STOCK_ACCOUNT}-${stamp}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      alert("Gagal download: " + (e as Error).message);
    }
    setDownloading(false);
  }

  if (!mounted) return null;

  const units = (detail?.allUnits || []).filter((u) => u.chance != null && u.chance >= MIN_CHANCE);
  const backpack = detail?.backpack || [];

  const sewaUnits = units.filter((u) => state.sewa[unitKey(u)]);
  const sellUnits = units.filter((u) => {
    const k = unitKey(u);
    return !state.sewa[k] && !state.unitData[k]?.sold;
  }).sort((a, b) => (b.chance || 0) - (a.chance || 0));

  const half = Math.ceil(sellUnits.length / 2);
  const sellLeft = sellUnits.slice(0, half);
  const sellRight = sellUnits.slice(half);

  const gems = backpack.find((b) => b.name.toLowerCase().includes("gem"));
  const traitReroll = backpack.find((b) => b.name.toLowerCase().includes("trait reroll"));
  const luckySpin = backpack.find((b) => b.name.toLowerCase().includes("lucky spin"));
  const jackpot = backpack.find((b) => b.name.toLowerCase().includes("jackpot"));
  const gearItems = backpack.filter((b) => (b.kind || "").toLowerCase().includes("gear") || b.name.toLowerCase().match(/mask|fan|coat|robe|drum|halo|sword|sash|belt/));
  const divineGear = gearItems.filter((g) => g.rarity?.toLowerCase() === "divine").reduce((s, g) => s + (g.amount || 0), 0);

  const inventorySlots = [
    { key: "gems", name: "GEMS", item: gems, qty: gems?.amount || 0, value: (gems?.amount || 0) / 1000 * rates.gemRate, sub: `${rates.gemRate.toLocaleString("id-ID")} /1k`, accent: "#0891b2", bg: "#ecfeff" },
    { key: "trait", name: "TRAIT REROLL", item: traitReroll, qty: traitReroll?.amount || 0, value: (traitReroll?.amount || 0) / 1000 * rates.traitRerollRate, sub: `${rates.traitRerollRate.toLocaleString("id-ID")} /1k`, accent: "#6366f1", bg: "#eef2ff" },
    { key: "lucky", name: "LUCKY SPIN", item: luckySpin, qty: luckySpin?.amount || 0, value: (luckySpin?.amount || 0) * rates.luckySpinRate, sub: `${rates.luckySpinRate.toLocaleString("id-ID")} /pc`, accent: "#ca8a04", bg: "#fefce8" },
    { key: "jackpot", name: "JACKPOT", item: jackpot, qty: jackpot?.amount || 0, value: (jackpot?.amount || 0) * rates.jackpotRate, sub: `${rates.jackpotRate.toLocaleString("id-ID")} /pc`, accent: "#dc2626", bg: "#fef2f2" },
    { key: "gear", name: "DIVINE GEAR", item: null as BackpackItem | null, qty: divineGear, value: divineGear * rates.gearRate, sub: `${rates.gearRate.toLocaleString("id-ID")} /pc`, accent: "#9333ea", bg: "#faf5ff" },
  ];

  const totalEstimasi = inventorySlots.reduce((s, x) => s + x.value, 0)
    + Object.entries(state.unitData).reduce((s, [k, v]) => s + (v.sold ? 0 : v.price), 0);
  const totalSewaPerJam = sewaUnits.reduce((s, u) => s + (state.sewa[unitKey(u)]?.pricePerHour || 0), 0);
  const totalDeposit = sewaUnits.reduce((s, u) => s + (state.sewa[unitKey(u)]?.deposit || 0), 0);

  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="controls">
          <label>Pemilik:</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          <label>Kontak:</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WA / FB / Discord" />
          <button className="dlbtn" onClick={downloadPoster} disabled={downloading}>
            {downloading ? "Downloading..." : "⬇ Download PNG"}
          </button>
          <button className="dlbtn ghost" onClick={fetchAll}>&#x21BB; Refresh</button>
        </div>

        {loading ? (
          <div className="loading">Memuat data {STOCK_ACCOUNT}...</div>
        ) : !detail ? (
          <div className="loading">Belum ada data untuk {STOCK_ACCOUNT}.</div>
        ) : (
          <div className="poster-wrap">
            <div className="poster" ref={posterRef}>
              {/* Header */}
              <div className="rk-header">
                <div className="rk-brand">
                  <div className="rk-logo">NH</div>
                  <div>
                    <div className="rk-title">Katalog Stock Anime Dice</div>
                    <div className="rk-sub">NaruHub — Stock {STOCK_ACCOUNT} · Update {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
                  </div>
                </div>
                <div className="rk-header-right">
                  <div className="rk-owner">{owner}</div>
                  <div className="rk-contact">{contact}</div>
                  <div className="rk-scan">Hubungi untuk pembelian / sewa</div>
                </div>
              </div>

              {/* Summary stats */}
              <div className="stat-bar">
                <div className="stat-cell green">
                  <div className="s-label">TOTAL ESTIMASI</div>
                  <div className="s-value">{fmtRp(totalEstimasi)}</div>
                </div>
                <div className="stat-cell gold">
                  <div className="s-label">UNIT SEWA</div>
                  <div className="s-value">{sewaUnits.length}</div>
                </div>
                <div className="stat-cell blue">
                  <div className="s-label">UNIT SELL (1sx+)</div>
                  <div className="s-value">{sellUnits.length}</div>
                </div>
                <div className="stat-cell red">
                  <div className="s-label">SEWA / JAM</div>
                  <div className="s-value">{fmtRp(totalSewaPerJam)}</div>
                </div>
                <div className="stat-cell purple">
                  <div className="s-label">TOTAL DEPO</div>
                  <div className="s-value">{fmtRp(totalDeposit)}</div>
                </div>
              </div>

              {/* OPEN SEWA UNIT */}
              <div className="sec-head">OPEN SEWA UNIT</div>
              {sewaUnits.length === 0 ? (
                <div className="empty-box">Belum ada unit yang dibuka untuk sewa</div>
              ) : (
                <div className="sewa-grid">
                  {sewaUnits.slice(0, 4).map((u, i) => {
                    const k = unitKey(u);
                    const sewa = state.sewa[k];
                    const rc = rarityColor(u.rarity);
                    const img = unitPortraitUrl(u);
                    return (
                      <div key={i} className="sewa-card">
                        <div className="sc-portrait" style={{ background: unitGradient(u) }}>
                          {img ? (
                            <img src={img} alt={u.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="sc-fallback">{u.name[0]}</div>
                          )}
                          <div className="sc-rarity" style={{ background: rc }}>{u.rarity}</div>
                        </div>
                        <div className="sc-body">
                          <div className="sc-name">{u.variant ? `${u.variant} ` : ""}{u.name}</div>
                          <div className="sc-meta">
                            {u.grade && <span className="sc-tag">Grade {u.grade}</span>}
                            {u.trait && <span className="sc-tag">{u.trait}</span>}
                          </div>
                          <div className="sc-income">${fmtMoney(u.income)}/s</div>
                          <div className="sc-price-row">
                            <div className="scp-item">
                              <div className="scp-l">Rp/jam</div>
                              <div className="scp-v">{fmtRp(sewa.pricePerHour)}</div>
                            </div>
                            <div className="scp-item">
                              <div className="scp-l">Deposit</div>
                              <div className="scp-v depo">{fmtRp(sewa.deposit)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SELL UNIT SX */}
              <div className="sec-head" style={{ marginTop: 18 }}>SELL UNIT SX</div>
              {sellUnits.length === 0 ? (
                <div className="empty-box">Belum ada unit tersedia untuk dijual</div>
              ) : (
                <div className="sell-cols">
                  <div className="sell-col">
                    {sellLeft.map((u, i) => <SellRow key={i} u={u} state={state} />)}
                  </div>
                  <div className="sell-col">
                    {sellRight.map((u, i) => <SellRow key={i} u={u} state={state} />)}
                  </div>
                </div>
              )}

              {/* INVENTORY */}
              <div className="sec-head" style={{ marginTop: 18 }}>INVENTORY</div>
              <div className="inv-grid">
                {inventorySlots.map((it) => {
                  const img = imageUrl(it.item?.image);
                  return (
                    <div key={it.key} className="inv-card" style={{ borderColor: it.accent, background: it.bg }}>
                      <div className="ic-icon-wrap">
                        {img ? (
                          <img src={img} alt={it.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="ic-emoji" style={{ color: it.accent }}>{it.key === "gems" ? "\u{1F48E}" : it.key === "trait" ? "\u{1F504}" : it.key === "lucky" ? "\u{1F3B0}" : it.key === "jackpot" ? "\u{1F3AF}" : "\u{2699}\u{FE0F}"}</div>
                        )}
                      </div>
                      <div className="ic-name" style={{ color: it.accent }}>{it.name}</div>
                      <div className="ic-qty">{fmtNum(it.qty)}</div>
                      <div className="ic-sub">{it.sub}</div>
                      <div className="ic-value" style={{ color: it.accent, borderColor: it.accent + "40" }}>
                        {it.value > 0 ? fmtRp(it.value) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="rk-foot">
                Poster resmi dari <strong>{owner}</strong> — Kalau tidak ada watermark, itu POSTER PALSU. · naruhub.my.id
              </div>

              {/* Watermark */}
              <div className="rk-wm">
                {Array.from({ length: 22 }).map((_, r) => (
                  <div key={r} className={`rk-wm-row ${r % 2 === 1 ? "stagger" : ""}`}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i}>HAK MILIK · {(owner || STOCK_ACCOUNT).toUpperCase()}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SellRow({ u, state }: { u: Unit; state: InventoryState }) {
  const k = unitKey(u);
  const s = state.unitData[k];
  const rc = rarityColor(u.rarity);
  const img = unitPortraitUrl(u);
  return (
    <div className="sell-row">
      <div className="sr-portrait" style={{ background: unitGradient(u) }}>
        {img ? (
          <img src={img} alt={u.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="sr-fallback">{u.name[0]}</div>
        )}
      </div>
      <div className="sr-info">
        <div className="sr-name">
          <span style={{ color: rc }}>{u.variant ? `${u.variant} ` : ""}{u.name}</span>
        </div>
        <div className="sr-meta">
          <span className="sr-chance">1 in {fmtMoney(u.chance)}</span>
          {u.grade && <span className="sr-tag">G:{u.grade}</span>}
          {u.trait && <span className="sr-tag">{u.trait}</span>}
        </div>
      </div>
      <div className="sr-price">{s?.price ? fmtRp(s.price) : "—"}</div>
    </div>
  );
}

const styles = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.page { min-height: 100vh; background: #0b0b14; padding: 20px; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #e8e8f0; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 18px; background: #14141f; border: 1px solid #262636; border-radius: 12px; margin-bottom: 20px; max-width: 1120px; margin-left: auto; margin-right: auto; position: sticky; top: 8px; z-index: 100; }
.controls label { font-size: 12px; font-weight: 700; color: #8b8ba3; }
.controls input { background: #1c1c2b; color: #e8e8f0; border: 1px solid #262636; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; width: 200px; }
.controls input:focus { outline: none; border-color: #a78bfa; }
.dlbtn { background: #a78bfa; color: #1a1030; border: none; padding: 9px 20px; font-size: 13px; font-weight: 800; border-radius: 8px; cursor: pointer; letter-spacing: .3px; }
.dlbtn.ghost { background: #262636; color: #e8e8f0; }
.dlbtn:hover { filter: brightness(1.1); }
.dlbtn:disabled { opacity: .6; cursor: not-allowed; }
.loading { text-align: center; padding: 80px 20px; color: #555570; font-size: 14px; }

.poster-wrap { display: flex; justify-content: center; padding: 20px 0; overflow-x: auto; }
.poster {
  width: 1080px;
  background: #DFE7F0;
  padding: 0;
  color: #0f172a;
  position: relative;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.4);
}

/* Header */
.rk-header {
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #fff;
  padding: 24px 40px;
  display: flex;
  align-items: center;
  gap: 20px;
  border-bottom: 4px solid #facc15;
  position: relative;
  z-index: 3;
}
.rk-brand { display: flex; align-items: center; gap: 16px; flex: 1; }
.rk-logo { width: 56px; height: 56px; background: #facc15; color: #0f172a; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 22px; flex-shrink: 0; }
.rk-title { font-size: 26px; font-weight: 900; letter-spacing: .5px; }
.rk-sub { color: #cbd5e1; font-size: 12px; margin-top: 4px; letter-spacing: .3px; }
.rk-header-right { text-align: right; }
.rk-owner { font-size: 20px; font-weight: 900; color: #facc15; letter-spacing: .5px; }
.rk-contact { font-size: 12px; color: #f8fafc; font-weight: 700; margin-top: 4px; }
.rk-scan { font-size: 11px; color: #94a3b8; margin-top: 3px; }

/* Stat bar */
.stat-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 16px 32px 0;
  position: relative;
  z-index: 3;
}
.stat-cell { background: #ffffff; border: 2px solid; border-radius: 12px; padding: 10px 14px; }
.stat-cell.green { border-color: #16a34a; background: #ecfdf5; }
.stat-cell.gold { border-color: #ca8a04; background: #fefce8; }
.stat-cell.blue { border-color: #2563eb; background: #eff6ff; }
.stat-cell.red { border-color: #dc2626; background: #fef2f2; }
.stat-cell.purple { border-color: #7c3aed; background: #f5f3ff; }
.s-label { font-size: 10px; font-weight: 800; color: #64748b; letter-spacing: .5px; }
.s-value { font-size: 18px; font-weight: 900; margin-top: 3px; color: #0f172a; }
.stat-cell.green .s-value { color: #15803d; }
.stat-cell.gold .s-value { color: #a16207; }
.stat-cell.blue .s-value { color: #1d4ed8; }
.stat-cell.red .s-value { color: #b91c1c; }
.stat-cell.purple .s-value { color: #6d28d9; }

/* Section header */
.sec-head {
  background: #cbd5e1;
  color: #0f172a;
  border-radius: 999px;
  padding: 8px 20px;
  text-align: center;
  font-size: 14px;
  font-weight: 900;
  margin: 18px 32px 12px;
  letter-spacing: 2px;
  position: relative;
  z-index: 3;
}
.empty-box {
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  margin: 0 32px;
  position: relative;
  z-index: 3;
}

/* Sewa cards */
.sewa-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 0 32px;
  position: relative;
  z-index: 3;
}
.sewa-card {
  background: #ffffff;
  border: 2px solid #ca8a04;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sc-portrait {
  width: 100%;
  aspect-ratio: 1/1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.sc-portrait img { width: 100%; height: 100%; object-fit: cover; }
.sc-fallback {
  font-size: 60px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 3px 12px rgba(0,0,0,.4);
}
.sc-rarity {
  position: absolute;
  top: 8px;
  left: 8px;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: .5px;
  text-shadow: 0 1px 2px rgba(0,0,0,.3);
}
.sc-body { padding: 10px 12px 12px; }
.sc-name { font-size: 13px; font-weight: 900; color: #0f172a; margin-bottom: 6px; line-height: 1.2; min-height: 32px; }
.sc-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.sc-tag { background: #f1f5f9; color: #475569; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
.sc-income { font-size: 13px; font-weight: 900; color: #16a34a; margin-bottom: 8px; }
.sc-price-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.scp-item { background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; padding: 5px 6px; text-align: center; }
.scp-l { font-size: 8px; font-weight: 800; color: #92400e; letter-spacing: .3px; }
.scp-v { font-size: 11px; font-weight: 900; color: #a16207; margin-top: 1px; }
.scp-v.depo { color: #78350f; }

/* Sell rows */
.sell-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 0 32px;
  position: relative;
  z-index: 3;
}
.sell-col { display: flex; flex-direction: column; gap: 6px; }
.sell-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 10px;
}
.sr-portrait {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #cbd5e1;
}
.sr-portrait img { width: 100%; height: 100%; object-fit: cover; }
.sr-fallback { font-size: 20px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }
.sr-info { flex: 1; min-width: 0; }
.sr-name { font-size: 12px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sr-meta { display: flex; gap: 6px; margin-top: 2px; flex-wrap: wrap; align-items: center; }
.sr-chance { font-size: 10px; color: #475569; font-weight: 800; }
.sr-tag { font-size: 8px; font-weight: 900; padding: 1px 5px; background: #f1f5f9; color: #64748b; border-radius: 3px; letter-spacing: .3px; }
.sr-price { font-size: 13px; font-weight: 900; color: #a16207; padding: 4px 10px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; flex-shrink: 0; min-width: 80px; text-align: right; }

/* Inventory */
.inv-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 0 32px;
  position: relative;
  z-index: 3;
}
.inv-card {
  border: 2px solid;
  border-radius: 14px;
  padding: 14px 10px;
  text-align: center;
}
.ic-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: #ffffff;
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,.06);
}
.ic-icon-wrap img { width: 100%; height: 100%; object-fit: contain; }
.ic-emoji { font-size: 30px; }
.ic-name { font-size: 11px; font-weight: 900; letter-spacing: .5px; margin-bottom: 6px; }
.ic-qty { font-size: 20px; font-weight: 900; color: #0f172a; }
.ic-sub { font-size: 10px; color: #64748b; font-weight: 700; margin-top: 2px; }
.ic-value {
  font-size: 12px;
  font-weight: 900;
  padding: 5px 8px;
  background: #ffffff;
  border: 1px solid;
  border-radius: 6px;
  margin-top: 8px;
}

/* Footer */
.rk-foot {
  background: #0f172a;
  color: #cbd5e1;
  padding: 14px 40px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  border-top: 3px solid #facc15;
  margin-top: 20px;
  position: relative;
  z-index: 3;
}
.rk-foot strong { color: #facc15; }

/* Watermark: repeated text, rotated, staggered — like SAE katalog rangkuman */
.rk-wm {
  position: absolute;
  top: -300px; left: -300px; right: -300px; bottom: -300px;
  pointer-events: none;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 40px;
  padding: 30px 0;
  transform: rotate(-22deg);
}
.rk-wm-row {
  display: flex;
  gap: 70px;
  white-space: nowrap;
  justify-content: flex-start;
  padding-left: 0;
}
.rk-wm-row.stagger { padding-left: 140px; }
.rk-wm span {
  color: rgba(120, 130, 155, 0.16);
  font-weight: 900;
  font-size: 30px;
  letter-spacing: 3px;
  flex-shrink: 0;
}
`;
