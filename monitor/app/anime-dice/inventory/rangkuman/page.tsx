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
  const [qrTarget, setQrTarget] = useState("https://www.facebook.com/naruaho");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(qrTarget, {
          width: 220,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl("");
      }
    })();
    return () => { cancelled = true; };
  }, [qrTarget]);

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

  const gems = backpack.find((b) => b.name.toLowerCase().includes("gem"));
  const traitReroll = backpack.find((b) => b.name.toLowerCase().includes("trait reroll"));
  const luckySpin = backpack.find((b) => b.name.toLowerCase().includes("lucky spin"));
  const jackpot = backpack.find((b) => b.name.toLowerCase().includes("jackpot"));
  const gearItems = backpack.filter((b) => (b.kind || "").toLowerCase().includes("gear") || b.name.toLowerCase().match(/mask|fan|coat|robe|drum|halo|sword|sash|belt/));
  const divineGear = gearItems.filter((g) => g.rarity?.toLowerCase() === "divine").reduce((s, g) => s + (g.amount || 0), 0);

  const inventorySlots = [
    { key: "gems", name: "GEMS", item: gems, qty: gems?.amount || 0, value: (gems?.amount || 0) / 1000 * rates.gemRate, sub: `${rates.gemRate.toLocaleString("id-ID")} /1k`, accent: "#0891b2", bg: "#ecfeff", emoji: "\u{1F48E}" },
    { key: "trait", name: "TRAIT REROLL", item: traitReroll, qty: traitReroll?.amount || 0, value: (traitReroll?.amount || 0) / 1000 * rates.traitRerollRate, sub: `${rates.traitRerollRate.toLocaleString("id-ID")} /1k`, accent: "#6366f1", bg: "#eef2ff", emoji: "\u{1F504}" },
    { key: "lucky", name: "LUCKY SPIN", item: luckySpin, qty: luckySpin?.amount || 0, value: (luckySpin?.amount || 0) * rates.luckySpinRate, sub: `${rates.luckySpinRate.toLocaleString("id-ID")} /pc`, accent: "#ca8a04", bg: "#fefce8", emoji: "\u{1F3B0}" },
    { key: "jackpot", name: "JACKPOT", item: jackpot, qty: jackpot?.amount || 0, value: (jackpot?.amount || 0) * rates.jackpotRate, sub: `${rates.jackpotRate.toLocaleString("id-ID")} /pc`, accent: "#dc2626", bg: "#fef2f2", emoji: "\u{1F3AF}" },
    { key: "gear", name: "DIVINE GEAR", item: null as BackpackItem | null, qty: divineGear, value: divineGear * rates.gearRate, sub: `${rates.gearRate.toLocaleString("id-ID")} /pc`, accent: "#9333ea", bg: "#faf5ff", emoji: "\u{2699}\u{FE0F}" },
  ];

  const totalEstimasi = inventorySlots.reduce((s, x) => s + x.value, 0)
    + Object.entries(state.unitData).reduce((s, [k, v]) => s + (v.sold ? 0 : v.price), 0);
  const totalSewaPerJam = sewaUnits.reduce((s, u) => s + (state.sewa[unitKey(u)]?.pricePerHour || 0), 0);
  const totalDeposit = sewaUnits.reduce((s, u) => s + (state.sewa[unitKey(u)]?.deposit || 0), 0);

  const sellHalf = Math.ceil(sellUnits.length / 2);
  const sellLeft = sellUnits.slice(0, sellHalf);
  const sellRight = sellUnits.slice(sellHalf);

  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="controls">
          <label>Pemilik:</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          <label>Kontak:</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} />
          <label>QR link:</label>
          <input value={qrTarget} onChange={(e) => setQrTarget(e.target.value)} style={{ width: 260 }} />
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
              {/* Header with QR */}
              <div className="rk-header">
                <div className="rk-brand">
                  <img className="rk-logo-img" src="/logo-naru.png" alt="Naru" crossOrigin="anonymous" />
                  <div>
                    <div className="rk-title">Katalog Stock Anime Dice</div>
                    <div className="rk-sub">NaruHub &mdash; Stock {STOCK_ACCOUNT} &middot; Update {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
                  </div>
                </div>
                <div className="rk-header-right">
                  <div className="rk-owner">{owner}</div>
                  <div className="rk-contact">{contact}</div>
                </div>
                {qrDataUrl && (
                  <div className="rk-qr">
                    <img src={qrDataUrl} alt="QR" />
                    <div className="rk-qr-caption">Scan</div>
                  </div>
                )}
              </div>

              {/* Compact stat bar without labels */}
              <div className="stat-bar">
                <div className="stat-cell green" title="Total Estimasi">
                  <span className="s-ico">&#x1F4B0;</span>
                  <span className="s-value">{fmtRp(totalEstimasi)}</span>
                </div>
                <div className="stat-cell gold" title="Unit Sewa">
                  <span className="s-ico">&#x1F511;</span>
                  <span className="s-value">{sewaUnits.length}</span>
                </div>
                <div className="stat-cell blue" title="Unit Sell 1sx+">
                  <span className="s-ico">&#x1F6D2;</span>
                  <span className="s-value">{sellUnits.length}</span>
                </div>
                <div className="stat-cell red" title="Sewa per jam">
                  <span className="s-ico">&#x23F1;&#xFE0F;</span>
                  <span className="s-value">{fmtRp(totalSewaPerJam)}</span>
                </div>
                <div className="stat-cell purple" title="Total Deposit">
                  <span className="s-ico">&#x1F3E6;</span>
                  <span className="s-value">{fmtRp(totalDeposit)}</span>
                </div>
              </div>

              {/* OPEN SEWA UNIT */}
              <div className="sec-head">
                <div className="sec-line" /><div className="sec-text">OPEN SEWA UNIT</div><div className="sec-line" />
              </div>
              {sewaUnits.length === 0 ? (
                <div className="empty-box">Belum ada unit yang dibuka untuk sewa</div>
              ) : (
                <div className="sewa-grid">
                  {sewaUnits.map((u, i) => {
                    const k = unitKey(u);
                    const sewa = state.sewa[k];
                    const cs = (u.colors && u.colors.length > 0) ? u.colors : [rarityColor(u.rarity), rarityColor(u.rarity)];
                    const borderGrad = `linear-gradient(135deg, ${cs.join(", ")})`;
                    const rarityGrad = cs.length >= 2 ? `linear-gradient(90deg, ${cs.join(", ")})` : `linear-gradient(90deg, ${cs[0]}, ${cs[0]}aa)`;
                    return (
                      <div key={i} className="game-card" style={{ ["--glow" as any]: cs[0] || "#facc15" }}>
                        <div className="gc-border" style={{ background: borderGrad }} />
                        <div className="gc-inner">
                          <div className="gc-name">{u.variant ? `${u.variant} ` : ""}{u.name}</div>
                          <div className="gc-rarity" style={{ backgroundImage: rarityGrad, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" }}>
                            {u.rarity}
                          </div>
                          <div className="gc-divider" />
                          <div className="gc-line">Level {u.level ?? "-"}</div>
                          {u.mutation && (
                            <div className="gc-line gc-mut">&#x1F52E; {u.mutation}</div>
                          )}
                          {u.grade && (
                            <div className="gc-line gc-grade">Grade: <span>{u.grade}</span></div>
                          )}
                          {u.trait && (
                            <div className="gc-line gc-trait">{u.trait}</div>
                          )}
                          <div className="gc-divider" />
                          <div className="gc-line gc-income">&#x1F4B0; ${fmtMoney(u.income)}/s</div>
                          <div className="gc-line gc-chance">1 in {fmtMoney(u.chance)}</div>
                          <div className="gc-divider" />
                          <div className="gc-price-row">
                            <div className="gcp-item">
                              <div className="gcp-l">Rp / jam</div>
                              <div className="gcp-v">{fmtRp(sewa.pricePerHour)}</div>
                            </div>
                            <div className="gcp-item depo">
                              <div className="gcp-l">Deposit</div>
                              <div className="gcp-v">{fmtRp(sewa.deposit)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SELL UNIT SX — plain text rows, no cards */}
              <div className="sec-head">
                <div className="sec-line" /><div className="sec-text">SELL UNIT SX</div><div className="sec-line" />
              </div>
              {sellUnits.length === 0 ? (
                <div className="empty-box">Belum ada unit tersedia untuk dijual</div>
              ) : (
                <div className="sell-plain">
                  <div className="sell-col">
                    {sellLeft.map((u, i) => <SellRow key={i} u={u} state={state} />)}
                  </div>
                  <div className="sell-col">
                    {sellRight.map((u, i) => <SellRow key={i} u={u} state={state} />)}
                  </div>
                </div>
              )}

              {/* INVENTORY */}
              <div className="sec-head">
                <div className="sec-line" /><div className="sec-text">INVENTORY</div><div className="sec-line" />
              </div>
              <div className="inv-grid">
                {inventorySlots.map((it) => {
                  const img = imageUrl(it.item?.image);
                  return (
                    <div key={it.key} className="inv-card" style={{ borderColor: it.accent, background: it.bg }}>
                      <div className="ic-icon-wrap">
                        {img ? (
                          <img src={img} alt={it.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="ic-emoji" style={{ color: it.accent }}>{it.emoji}</div>
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
                Poster resmi dari <strong>{owner}</strong> &mdash; Kalau tidak ada watermark / QR, itu POSTER PALSU. &middot; naruhub.my.id
              </div>

              {/* Watermark */}
              <div className="rk-wm">
                {Array.from({ length: 22 }).map((_, r) => (
                  <div key={r} className={`rk-wm-row ${r % 2 === 1 ? "stagger" : ""}`}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i}>HAK MILIK &middot; {(owner || STOCK_ACCOUNT).toUpperCase()}</span>
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
  return (
    <div className="sell-plain-row">
      <div className="spr-left">
        <span className="spr-name" style={{ color: rc }}>{u.variant ? `${u.variant} ` : ""}{u.name}</span>
        <span className="spr-chance">1 in {fmtMoney(u.chance)}</span>
      </div>
      <div className="spr-price">{s?.price ? fmtRp(s.price) : "—"}</div>
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
.rk-brand { display: flex; align-items: center; gap: 18px; flex: 1; }
.rk-logo-img {
  width: 68px; height: 68px; border-radius: 14px;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid #facc15;
  background: #fff;
}
.rk-title { font-size: 30px; font-weight: 900; letter-spacing: .5px; }
.rk-sub { color: #cbd5e1; font-size: 13px; margin-top: 4px; letter-spacing: .3px; }
.rk-header-right { text-align: right; }
.rk-owner { font-size: 22px; font-weight: 900; color: #facc15; letter-spacing: .5px; }
.rk-contact { font-size: 12px; color: #f8fafc; font-weight: 700; margin-top: 4px; }
.rk-qr {
  background: #fff;
  padding: 6px 6px 4px;
  border-radius: 10px;
  text-align: center;
  flex-shrink: 0;
}
.rk-qr img { display: block; width: 90px; height: 90px; }
.rk-qr-caption { font-size: 9px; font-weight: 900; color: #0f172a; letter-spacing: 1px; margin-top: 2px; }

/* Stat bar — icon + value only, no text labels */
.stat-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 16px 32px 0;
  position: relative;
  z-index: 3;
}
.stat-cell {
  background: #ffffff;
  border: 2px solid;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}
.stat-cell.green { border-color: #16a34a; background: #ecfdf5; }
.stat-cell.gold { border-color: #ca8a04; background: #fefce8; }
.stat-cell.blue { border-color: #2563eb; background: #eff6ff; }
.stat-cell.red { border-color: #dc2626; background: #fef2f2; }
.stat-cell.purple { border-color: #7c3aed; background: #f5f3ff; }
.s-ico { font-size: 24px; line-height: 1; }
.s-value { font-size: 22px; font-weight: 900; color: #0f172a; }
.stat-cell.green .s-value { color: #15803d; }
.stat-cell.gold .s-value { color: #a16207; }
.stat-cell.blue .s-value { color: #1d4ed8; }
.stat-cell.red .s-value { color: #b91c1c; }
.stat-cell.purple .s-value { color: #6d28d9; }

/* Section header — bigger, with side lines */
.sec-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 40px;
  margin: 26px 0 16px;
  position: relative;
  z-index: 3;
}
.sec-line { flex: 1; height: 3px; background: #0f172a; border-radius: 2px; }
.sec-text {
  font-size: 26px;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: 4px;
  padding: 6px 20px;
  background: #facc15;
  border-radius: 8px;
  border: 2px solid #0f172a;
  white-space: nowrap;
}
.empty-box {
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 700;
  margin: 0 32px;
  position: relative;
  z-index: 3;
}

/* Sewa cards — in-game style (dark bg, gradient glow border) */
.sewa-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  padding: 0 32px;
  position: relative;
  z-index: 3;
}
.game-card {
  position: relative;
  border-radius: 14px;
  padding: 3px;
  box-shadow: 0 0 24px var(--glow, #facc15)55, 0 4px 12px rgba(0,0,0,.3);
}
.gc-border {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  z-index: 1;
}
.gc-inner {
  position: relative;
  z-index: 2;
  background:
    linear-gradient(45deg, rgba(255,255,255,.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.02) 75%) 0 0 / 12px 12px,
    linear-gradient(45deg, rgba(255,255,255,.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.02) 75%) 6px 6px / 12px 12px,
    #181820;
  border-radius: 11px;
  padding: 14px 16px 12px;
  color: #f8fafc;
  text-align: center;
  min-height: 100%;
}
.gc-name {
  font-size: 20px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1.15;
  margin-bottom: 4px;
  letter-spacing: .2px;
  text-shadow: 0 2px 6px rgba(0,0,0,.5);
}
.gc-rarity {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1px;
  margin-bottom: 10px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
}
.gc-divider {
  height: 1px;
  background: rgba(255,255,255,0.28);
  margin: 8px auto;
  width: 85%;
}
.gc-line {
  font-size: 14px;
  font-weight: 700;
  color: #e2e8f0;
  padding: 3px 0;
  letter-spacing: .2px;
}
.gc-line.gc-mut {
  background: linear-gradient(90deg, #cbd5e1, #f8fafc, #cbd5e1);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  font-weight: 800;
  font-style: italic;
}
.gc-line.gc-grade {
  color: #a855f7;
  font-weight: 800;
}
.gc-line.gc-grade span {
  color: #facc15;
  font-weight: 900;
  font-size: 16px;
}
.gc-line.gc-trait {
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .5px;
}
.gc-line.gc-income {
  color: #86efac;
  font-weight: 800;
  font-size: 15px;
}
.gc-line.gc-chance {
  color: #f1f5f9;
  font-weight: 800;
  font-size: 15px;
}
.gc-price-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 4px;
}
.gcp-item {
  background: rgba(250, 204, 21, 0.15);
  border: 1px solid rgba(250, 204, 21, 0.4);
  border-radius: 6px;
  padding: 6px 4px;
  text-align: center;
}
.gcp-item.depo {
  background: rgba(120, 53, 15, 0.25);
  border-color: rgba(217, 119, 6, 0.5);
}
.gcp-l {
  font-size: 9px;
  font-weight: 800;
  color: #fde68a;
  letter-spacing: .5px;
  text-transform: uppercase;
}
.gcp-item.depo .gcp-l { color: #fdba74; }
.gcp-v {
  font-size: 13px;
  font-weight: 900;
  color: #fef3c7;
  margin-top: 2px;
}
.gcp-item.depo .gcp-v { color: #fed7aa; }

/* Sell unit — plain text list, 2 columns, prominent "1 in Xsx" */
.sell-plain {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 24px;
  padding: 0 40px;
  position: relative;
  z-index: 3;
}
.sell-col { display: flex; flex-direction: column; gap: 4px; }
.sell-plain-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 4px;
  border-bottom: 1px dashed #cbd5e1;
  gap: 12px;
}
.spr-left { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; }
.spr-name { font-size: 15px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
.spr-chance { font-size: 17px; font-weight: 900; color: #0f172a; white-space: nowrap; }
.spr-price { font-size: 14px; font-weight: 900; color: #a16207; white-space: nowrap; flex-shrink: 0; }

/* Inventory */
.inv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
  margin-top: 26px;
  position: relative;
  z-index: 3;
}
.rk-foot strong { color: #facc15; }

/* Watermark: repeated text, rotated, staggered */
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
