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

export default function RangkumanPage() {
  const [mounted, setMounted] = useState(false);
  const [detail, setDetail] = useState<ADDetail | null>(null);
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [state, setState] = useState<InventoryState>({ unitData: {}, bpSold: {}, sewa: {} });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [owner, setOwner] = useState("KaijuBer2");
  const [contact, setContact] = useState("");
  const [showPoliceLine, setShowPoliceLine] = useState(true);
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
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `rangkuman-${STOCK_ACCOUNT}-${stamp}.png`;
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

  // Split sell into 2 columns
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
    { key: "gems", name: "GEMS", item: gems, qty: gems?.amount || 0, value: (gems?.amount || 0) / 1000 * rates.gemRate, rate: `${rates.gemRate} /1k`, color: "#22d3ee", emoji: "\u{1F48E}" },
    { key: "trait", name: "TRAIT REROLL", item: traitReroll, qty: traitReroll?.amount || 0, value: (traitReroll?.amount || 0) / 1000 * rates.traitRerollRate, rate: `${rates.traitRerollRate} /1k`, color: "#818cf8", emoji: "\u{1F504}" },
    { key: "lucky", name: "LUCKY SPIN", item: luckySpin, qty: luckySpin?.amount || 0, value: (luckySpin?.amount || 0) * rates.luckySpinRate, rate: `${rates.luckySpinRate} /pc`, color: "#fbbf24", emoji: "\u{1F3B0}" },
    { key: "jackpot", name: "JACKPOT", item: jackpot, qty: jackpot?.amount || 0, value: (jackpot?.amount || 0) * rates.jackpotRate, rate: `${rates.jackpotRate} /pc`, color: "#ef4444", emoji: "\u{1F3AF}" },
    { key: "gear", name: "DIVINE GEAR", item: null as BackpackItem | null, qty: divineGear, value: divineGear * rates.gearRate, rate: `${rates.gearRate} /pc`, color: "#c084fc", emoji: "\u{2699}\u{FE0F}" },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="controls">
          <label>Nama Pemilik:</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          <label>Kontak:</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WA / Discord" style={{ width: 180 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={showPoliceLine} onChange={(e) => setShowPoliceLine(e.target.checked)} />
            Police Line Hak Milik
          </label>
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
              <div className="header">
                <div className="brand">
                  <div className="brand-logo">NH</div>
                  <div>
                    <div className="brand-title">NARUHUB</div>
                    <div className="brand-sub">ANIME DICE STOCK</div>
                  </div>
                </div>
                <div className="header-right">
                  <div className="acc-name">{owner || STOCK_ACCOUNT}</div>
                  {contact && <div className="acc-contact">{contact}</div>}
                  <div className="acc-date">{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
                </div>
              </div>

              {/* OPEN SEWA UNIT */}
              <div className="section">
                <div className="section-head">OPEN SEWA UNIT</div>
                <div className="section-body">
                  {sewaUnits.length === 0 ? (
                    <div className="empty-slot">Belum ada unit yang dibuka untuk sewa</div>
                  ) : (
                    <div className="sewa-grid">
                      {sewaUnits.slice(0, 4).map((u, i) => {
                        const k = unitKey(u);
                        const sewa = state.sewa[k];
                        const rc = rarityColor(u.rarity);
                        const img = imageUrl(u.image);
                        return (
                          <div key={i} className="sewa-card" style={{ borderColor: rc }}>
                            <div className="sc-portrait" style={{ background: `linear-gradient(135deg, ${rc}22, ${rc}05)` }}>
                              {img ? (
                                <img src={img} alt={u.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <div className="sc-fallback" style={{ color: rc }}>{u.name[0]}</div>
                              )}
                            </div>
                            <div className="sc-name" style={{ color: rc }}>{u.variant ? `${u.variant} ` : ""}{u.name}</div>
                            <div className="sc-income">{u.income ? fmtMoney(u.income) : "-"}/s</div>
                            <div className="sc-rp">{fmtRp(sewa.pricePerHour)} /jam</div>
                            <div className="sc-depo">DEPO: {fmtRp(sewa.deposit)}</div>
                          </div>
                        );
                      })}
                      {Array.from({ length: Math.max(0, 4 - sewaUnits.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="sewa-card empty">
                          <div className="sc-portrait" />
                          <div className="sc-name">-</div>
                          <div className="sc-income">-</div>
                          <div className="sc-rp">-</div>
                          <div className="sc-depo">-</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SELL UNIT SX */}
              <div className="section">
                <div className="section-head">SELL UNIT SX</div>
                <div className="section-body">
                  <div className="sell-cols">
                    <div className="sell-col">
                      {sellLeft.map((u, i) => {
                        const k = unitKey(u);
                        const s = state.unitData[k];
                        const rc = rarityColor(u.rarity);
                        const img = imageUrl(u.image);
                        return (
                          <div key={i} className="sell-row">
                            <div className="sr-portrait" style={{ borderColor: rc }}>
                              {img ? (
                                <img src={img} alt={u.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <div className="sr-fallback" style={{ background: rc + "22", color: rc }}>{u.name[0]}</div>
                              )}
                            </div>
                            <div className="sr-info">
                              <div className="sr-chance">1 in {fmtMoney(u.chance)}</div>
                              <div className="sr-name" style={{ color: rc }}>{u.name}</div>
                            </div>
                            <div className="sr-price">{s?.price ? fmtRp(s.price) : "Rp -"}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="sell-col">
                      {sellRight.map((u, i) => {
                        const k = unitKey(u);
                        const s = state.unitData[k];
                        const rc = rarityColor(u.rarity);
                        const img = imageUrl(u.image);
                        return (
                          <div key={i} className="sell-row">
                            <div className="sr-portrait" style={{ borderColor: rc }}>
                              {img ? (
                                <img src={img} alt={u.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <div className="sr-fallback" style={{ background: rc + "22", color: rc }}>{u.name[0]}</div>
                              )}
                            </div>
                            <div className="sr-info">
                              <div className="sr-chance">1 in {fmtMoney(u.chance)}</div>
                              <div className="sr-name" style={{ color: rc }}>{u.name}</div>
                            </div>
                            <div className="sr-price">{s?.price ? fmtRp(s.price) : "Rp -"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {sellUnits.length === 0 && (
                    <div className="empty-slot">Belum ada unit yang di-list untuk sell</div>
                  )}
                </div>
              </div>

              {/* INVENTORY */}
              <div className="section">
                <div className="section-head">INVENTORY</div>
                <div className="section-body">
                  <div className="inv-grid">
                    {inventorySlots.map((it) => {
                      const img = imageUrl(it.item?.image);
                      return (
                        <div key={it.key} className="inv-card" style={{ borderColor: it.color + "60" }}>
                          <div className="ic-icon" style={{ background: it.color + "18", color: it.color }}>
                            {img ? (
                              <img src={img} alt={it.name} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : it.emoji}
                          </div>
                          <div className="ic-name">{it.name}</div>
                          <div className="ic-qty">{fmtNum(it.qty)}</div>
                          <div className="ic-rate">{it.rate}</div>
                          <div className="ic-value">{it.value > 0 ? fmtRp(it.value) : "-"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="footer">
                <div className="footer-brand">naruhub.my.id</div>
                <div className="footer-note">Generated {new Date().toLocaleString("id-ID")}</div>
              </div>

              {/* Police Line Overlay */}
              {showPoliceLine && (
                <>
                  <div className="police-line top">
                    <div className="pl-inner">HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · </div>
                  </div>
                  <div className="police-line bottom">
                    <div className="pl-inner">HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · HAK MILIK · {owner || STOCK_ACCOUNT} · </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const styles = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.page { min-height: 100vh; background: #0b0b14; padding: 20px; font-family: 'Inter', system-ui, sans-serif; color: #e8e8f0; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 18px; background: #15152a; border: 1px solid #222240; border-radius: 12px; margin-bottom: 20px; max-width: 900px; margin-left: auto; margin-right: auto; }
.controls label { font-size: 12px; font-weight: 700; color: #94a3b8; }
.controls input[type="text"], .controls input:not([type]) { background: #0b0b14; border: 1px solid #222240; color: #e8e8f0; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; width: 160px; }
.controls input:focus { outline: none; border-color: #818cf8; }
.dlbtn { background: #818cf8; color: #0b0b14; border: none; padding: 10px 20px; font-size: 12px; font-weight: 800; border-radius: 8px; cursor: pointer; letter-spacing: .5px; }
.dlbtn.ghost { background: #222240; color: #e8e8f0; }
.dlbtn:disabled { opacity: .6; cursor: not-allowed; }
.loading { text-align: center; padding: 80px 20px; color: #555570; font-size: 14px; }

.poster-wrap { display: flex; justify-content: center; padding: 20px 0; }
.poster {
  width: 900px;
  background: #ffffff;
  color: #1a1a2e;
  padding: 30px;
  border-radius: 20px;
  position: relative;
  box-shadow: 0 20px 60px rgba(0,0,0,.4);
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

/* Header */
.header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 3px solid #1a1a2e; margin-bottom: 20px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-logo { width: 48px; height: 48px; background: #fbbf24; color: #0b0b14; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; }
.brand-title { font-size: 20px; font-weight: 900; color: #1a1a2e; letter-spacing: 1px; }
.brand-sub { font-size: 10px; font-weight: 800; color: #6366f1; letter-spacing: 2px; }
.header-right { text-align: right; }
.acc-name { font-size: 18px; font-weight: 900; color: #1a1a2e; }
.acc-contact { font-size: 11px; color: #6b7280; font-weight: 700; margin-top: 2px; }
.acc-date { font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px; }

/* Section */
.section { margin-bottom: 18px; border: 2px solid #1a1a2e; border-radius: 10px; overflow: hidden; }
.section-head { background: #cbd5e1; color: #1a1a2e; padding: 8px 16px; font-size: 13px; font-weight: 900; letter-spacing: 2px; text-align: center; border-bottom: 2px solid #1a1a2e; }
.section-body { padding: 14px; background: #f8fafc; }
.empty-slot { text-align: center; color: #94a3b8; padding: 20px; font-size: 12px; font-weight: 600; }

/* Sewa */
.sewa-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.sewa-card { border: 2px solid #cbd5e1; border-radius: 10px; padding: 8px; text-align: center; background: #ffffff; }
.sewa-card.empty { opacity: .3; }
.sc-portrait { width: 100%; aspect-ratio: 3/4; background: #e2e8f0; border-radius: 6px; margin-bottom: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.sc-portrait img { width: 100%; height: 100%; object-fit: cover; }
.sc-fallback { font-size: 40px; font-weight: 900; }
.sc-name { font-size: 12px; font-weight: 900; margin-bottom: 4px; line-height: 1.2; min-height: 28px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sc-income { font-size: 11px; font-weight: 700; color: #059669; margin-bottom: 2px; }
.sc-rp { font-size: 12px; font-weight: 900; color: #1a1a2e; margin-top: 4px; padding: 3px 6px; background: #fef3c7; border-radius: 4px; }
.sc-depo { font-size: 10px; font-weight: 700; color: #6b7280; margin-top: 4px; }

/* Sell */
.sell-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sell-col { display: flex; flex-direction: column; gap: 6px; }
.sell-row { display: flex; align-items: center; gap: 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; }
.sr-portrait { width: 32px; height: 32px; border-radius: 6px; overflow: hidden; border: 2px solid; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.sr-portrait img { width: 100%; height: 100%; object-fit: cover; }
.sr-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; }
.sr-info { flex: 1; min-width: 0; }
.sr-chance { font-size: 10px; color: #6b7280; font-weight: 700; }
.sr-name { font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sr-price { font-size: 12px; font-weight: 900; color: #1a1a2e; padding: 3px 8px; background: #fef3c7; border-radius: 4px; flex-shrink: 0; }

/* Inventory */
.inv-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.inv-card { border: 2px solid; border-radius: 10px; padding: 10px 8px; text-align: center; background: #ffffff; }
.ic-icon { width: 44px; height: 44px; border-radius: 10px; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.ic-name { font-size: 10px; font-weight: 900; color: #1a1a2e; letter-spacing: .5px; margin-bottom: 4px; }
.ic-qty { font-size: 16px; font-weight: 900; color: #1a1a2e; }
.ic-rate { font-size: 9px; color: #94a3b8; font-weight: 700; margin: 2px 0; }
.ic-value { font-size: 11px; font-weight: 900; color: #059669; padding: 3px 6px; background: #d1fae5; border-radius: 4px; margin-top: 4px; }

/* Footer */
.footer { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid #1a1a2e; margin-top: 16px; }
.footer-brand { font-size: 12px; font-weight: 900; color: #6366f1; letter-spacing: 1px; }
.footer-note { font-size: 10px; color: #94a3b8; font-weight: 600; }

/* Police line */
.police-line {
  position: absolute;
  left: -60px;
  right: -60px;
  height: 32px;
  background: repeating-linear-gradient(-8deg, #fbbf24 0, #fbbf24 40px, #1a1a2e 40px, #1a1a2e 80px);
  transform: rotate(-3deg);
  overflow: hidden;
  display: flex;
  align-items: center;
  pointer-events: none;
}
.police-line.top { top: 60px; }
.police-line.bottom { bottom: 100px; }
.pl-inner {
  color: #1a1a2e;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 2px;
  white-space: nowrap;
  background: #fbbf24;
  padding: 6px 20px;
  border-top: 2px solid #1a1a2e;
  border-bottom: 2px solid #1a1a2e;
  width: 100%;
  text-align: center;
  text-shadow: 0 0 4px rgba(0,0,0,.15);
}
`;
