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

  // Count divine gear per slot for "set" calculation. A full set = 1 of each slot.
  const GEAR_SLOTS = ["Head", "Torso", "Back", "Upper", "Waist"];
  const gearBySlot: Record<string, number> = {};
  GEAR_SLOTS.forEach((s) => { gearBySlot[s] = 0; });
  gearItems.filter((g) => g.rarity?.toLowerCase() === "divine").forEach((g) => {
    const n = g.name.toLowerCase();
    let slot: string | null = null;
    if (n.includes("mask") || n.includes("helmet") || n.includes("hat") || n.includes("fan") || n.includes("head")) slot = "Head";
    else if (n.includes("coat") || n.includes("robe") || n.includes("shirt") || n.includes("chest") || n.includes("armor") || n.includes("torso")) slot = "Torso";
    else if (n.includes("drum") || n.includes("cape") || n.includes("wing") || n.includes("back")) slot = "Back";
    else if (n.includes("halo") || n.includes("sword") || n.includes("arm") || n.includes("shoulder") || n.includes("upper")) slot = "Upper";
    else if (n.includes("sash") || n.includes("belt") || n.includes("pants") || n.includes("leg") || n.includes("waist")) slot = "Waist";
    if (slot) gearBySlot[slot] += (g.amount || 0);
  });
  const fullSets = Math.min(...GEAR_SLOTS.map((s) => gearBySlot[s]));
  const gearSetValue = fullSets * GEAR_SLOTS.length * rates.gearRate;

  const inventorySlots = [
    { key: "gems", name: "GEMS", item: gems, qty: gems?.amount || 0, value: (gems?.amount || 0) / 1000 * rates.gemRate, rateText: `Rp ${rates.gemRate.toLocaleString("id-ID")}`, rateUnit: "/1k", accent: "#0891b2", bg: "#ecfeff", emoji: "\u{1F48E}" },
    { key: "trait", name: "TRAIT REROLL", item: traitReroll, qty: traitReroll?.amount || 0, value: (traitReroll?.amount || 0) / 1000 * rates.traitRerollRate, rateText: `Rp ${rates.traitRerollRate.toLocaleString("id-ID")}`, rateUnit: "/1k", accent: "#6366f1", bg: "#eef2ff", emoji: "\u{1F504}" },
    { key: "lucky", name: "LUCKY SPIN", item: luckySpin, qty: luckySpin?.amount || 0, value: (luckySpin?.amount || 0) * rates.luckySpinRate, rateText: `Rp ${rates.luckySpinRate.toLocaleString("id-ID")}`, rateUnit: "/pc", accent: "#ca8a04", bg: "#fefce8", emoji: "\u{1F3B0}" },
    { key: "jackpot", name: "JACKPOT", item: jackpot, qty: jackpot?.amount || 0, value: (jackpot?.amount || 0) * rates.jackpotRate, rateText: `Rp ${rates.jackpotRate.toLocaleString("id-ID")}`, rateUnit: "/pc", accent: "#dc2626", bg: "#fef2f2", emoji: "\u{1F3AF}" },
    { key: "gear", name: "DIVINE GEAR", item: null as BackpackItem | null, qty: divineGear, value: divineGear * rates.gearRate, rateText: `Rp ${rates.gearRate.toLocaleString("id-ID")}`, rateUnit: "/pc", accent: "#9333ea", bg: "#faf5ff", emoji: "\u{2699}\u{FE0F}", sets: fullSets, setValue: gearSetValue },
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
              {/* Header — logo + title | QR + owner (right) */}
              <div className="rk-header">
                <div className="rk-brand">
                  <img className="rk-logo-img" src="/logo-naru.png" alt="Naru" crossOrigin="anonymous" />
                  <div>
                    <div className="rk-title">Katalog Stock Anime Dice</div>
                    <div className="rk-sub">Stock {STOCK_ACCOUNT} &middot; Update {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
                  </div>
                </div>
                <div className="rk-header-right">
                  {qrDataUrl && (
                    <div className="rk-qr-box">
                      <img src={qrDataUrl} alt="QR" />
                    </div>
                  )}
                  <div className="rk-owner-block">
                    <div className="rk-owner">{owner}</div>
                    <div className="rk-contact">{contact}</div>
                  </div>
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
                          {/* Info kecil: level, mutation, grade, trait */}
                          <div className="gc-info-row">
                            <span>Lv.{u.level ?? "-"}</span>
                            {u.mutation && <span className="gc-mut-tag">{u.mutation}</span>}
                            {u.grade && <span className="gc-grade-tag">G:{u.grade}</span>}
                            {u.trait && <span className="gc-trait-tag">{u.trait}</span>}
                          </div>
                          <div className="gc-divider" />
                          {/* Stats penting: income + chance */}
                          <div className="gc-stat-row">
                            <div className="gcs-item income">
                              <div className="gcs-l">INCOME</div>
                              <div className="gcs-v">${fmtMoney(u.income)}/s</div>
                            </div>
                            <div className="gcs-item chance">
                              <div className="gcs-l">CHANCE</div>
                              <div className="gcs-v">1 in {fmtMoney(u.chance)}</div>
                            </div>
                          </div>
                          <div className="gc-divider" />
                          {/* Harga & deposit — paling penting */}
                          <div className="gc-price-row">
                            <div className="gcp-item">
                              <div className="gcp-l">Rp / JAM</div>
                              <div className="gcp-v">{fmtRp(sewa.pricePerHour)}</div>
                            </div>
                            <div className="gcp-item depo">
                              <div className="gcp-l">DEPOSIT</div>
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
                      <div className="ic-header">
                        <div className="ic-icon-wrap">
                          {img ? (
                            <img src={img} alt={it.name} crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="ic-emoji" style={{ color: it.accent }}>{it.emoji}</div>
                          )}
                        </div>
                        <div className="ic-name" style={{ color: it.accent }}>{it.name}</div>
                      </div>
                      {/* Rate big */}
                      <div className="ic-rate-big" style={{ color: it.accent }}>
                        {it.rateText}
                        <span className="ic-rate-unit">{it.rateUnit}</span>
                      </div>
                      {/* Divine gear: /set line */}
                      {it.key === "gear" && it.sets !== undefined && it.sets > 0 && (
                        <div className="ic-set-big" style={{ color: it.accent }}>
                          {fmtRp(it.setValue!)}<span className="ic-rate-unit">/set × {it.sets}</span>
                        </div>
                      )}
                      {/* Stock small */}
                      <div className="ic-stock">Stock: <b>{fmtNum(it.qty)}</b></div>
                      {/* Value */}
                      <div className="ic-value" style={{ color: it.accent, borderColor: it.accent + "40" }}>
                        {it.value > 0 ? fmtRp(it.value) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="rk-foot">
                Poster resmi dari <strong>{owner}</strong> &mdash; Kalau tidak ada watermark / QR, itu POSTER PALSU.
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
  return (
    <div className="sell-card">
      <div className="scd-info">
        <div className="scd-chance">1 in {fmtMoney(u.chance)}</div>
        <div className="scd-name">{u.variant ? `${u.variant} ` : ""}{u.name}</div>
      </div>
      <div className="scd-price">{s?.price ? fmtRp(s.price) : "—"}</div>
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
  min-height: 1500px;
  background: #DFE7F0;
  padding: 0 0 40px;
  color: #0f172a;
  position: relative;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
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
.rk-brand { display: flex; align-items: center; gap: 18px; flex: 1; min-width: 0; }
.rk-logo-img {
  width: 68px; height: 68px; border-radius: 14px;
  object-fit: cover;
  flex-shrink: 0;
  background: transparent;
}
.rk-title { font-size: 28px; font-weight: 900; letter-spacing: .5px; }
.rk-sub { color: #cbd5e1; font-size: 13px; margin-top: 4px; letter-spacing: .3px; }
.rk-header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.rk-qr-box {
  background: #fff;
  padding: 6px;
  border-radius: 10px;
  flex-shrink: 0;
}
.rk-qr-box img { display: block; width: 84px; height: 84px; }
.rk-owner-block { text-align: right; }
.rk-owner { font-size: 24px; font-weight: 900; color: #facc15; letter-spacing: .5px; line-height: 1.1; }
.rk-contact { font-size: 12px; color: #f8fafc; font-weight: 700; margin-top: 6px; }

/* Section header — bigger, with side lines */
.sec-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 32px;
  margin: 32px 0 18px;
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

/* Sewa cards — fixed 4 columns, wrap to next row when > 4 */
.sewa-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
  padding: 14px 12px 12px;
  color: #f8fafc;
  text-align: center;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.gc-name {
  font-size: 18px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1.15;
  margin-bottom: 4px;
  letter-spacing: .2px;
  text-shadow: 0 2px 6px rgba(0,0,0,.5);
  min-height: 42px;
}
.gc-rarity {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
  margin-bottom: 8px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
}
.gc-info-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #cbd5e1;
  margin-bottom: 4px;
  letter-spacing: .3px;
}
.gc-info-row > span {
  padding: 2px 7px;
  background: rgba(255,255,255,.05);
  border-radius: 4px;
}
.gc-info-row .gc-mut-tag {
  background: linear-gradient(90deg, rgba(203,213,225,.15), rgba(248,250,252,.2), rgba(203,213,225,.15));
  color: #f1f5f9;
  font-weight: 800;
}
.gc-info-row .gc-grade-tag { color: #facc15; background: rgba(168,85,247,.15); }
.gc-info-row .gc-trait-tag { color: #7dd3fc; background: rgba(56,189,248,.1); }

.gc-divider {
  height: 1px;
  background: rgba(255,255,255,0.28);
  margin: 8px auto;
  width: 90%;
}

/* Stats penting: income + chance */
.gc-stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.gcs-item {
  padding: 6px 4px;
  border-radius: 6px;
  text-align: center;
}
.gcs-item.income {
  background: rgba(52,211,153,.12);
  border: 1px solid rgba(52,211,153,.3);
}
.gcs-item.chance {
  background: rgba(148,163,184,.1);
  border: 1px solid rgba(148,163,184,.25);
}
.gcs-l {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .5px;
}
.gcs-item.income .gcs-l { color: #6ee7b7; }
.gcs-item.chance .gcs-l { color: #cbd5e1; }
.gcs-v {
  font-size: 15px;
  font-weight: 900;
  margin-top: 2px;
  letter-spacing: .2px;
}
.gcs-item.income .gcs-v { color: #86efac; }
.gcs-item.chance .gcs-v { color: #ffffff; }

/* Harga & deposit — paling menonjol */
.gc-price-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: auto;
}
.gcp-item {
  background: linear-gradient(180deg, #facc15, #eab308);
  border: 2px solid #713f12;
  border-radius: 8px;
  padding: 8px 4px;
  text-align: center;
  box-shadow: 0 2px 0 #713f12, 0 4px 10px rgba(250,204,21,.3);
}
.gcp-item.depo {
  background: linear-gradient(180deg, #f97316, #c2410c);
  border-color: #431407;
  box-shadow: 0 2px 0 #431407, 0 4px 10px rgba(249,115,22,.3);
}
.gcp-l {
  font-size: 9px;
  font-weight: 900;
  color: #713f12;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.gcp-item.depo .gcp-l { color: #431407; }
.gcp-v {
  font-size: 16px;
  font-weight: 900;
  color: #451a03;
  margin-top: 2px;
  letter-spacing: .2px;
  text-shadow: 0 1px 0 rgba(255,255,255,.3);
}
.gcp-item.depo .gcp-v { color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }

/* Sell unit — card per unit, 2 columns, black name + red "1 in Xsx" */
.sell-plain {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 0 32px;
  position: relative;
  z-index: 3;
}
.sell-col { display: flex; flex-direction: column; gap: 8px; }
.sell-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #ffffff;
  border: 2px solid #0f172a;
  border-radius: 10px;
  box-shadow: 0 2px 0 #0f172a;
}
.scd-info { min-width: 0; flex: 1; }
.scd-chance {
  font-size: 20px;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: .3px;
  line-height: 1.1;
}
.scd-name {
  font-size: 13px;
  font-weight: 800;
  color: #f87171;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  margin-top: 3px;
}
.scd-price {
  font-size: 15px;
  font-weight: 900;
  color: #a16207;
  padding: 6px 12px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

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
  padding: 12px 10px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ic-header {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  margin-bottom: 4px;
}
.ic-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,.06);
  flex-shrink: 0;
}
.ic-icon-wrap img { width: 100%; height: 100%; object-fit: contain; }
.ic-emoji { font-size: 20px; }
.ic-name { font-size: 11px; font-weight: 900; letter-spacing: .5px; }
.ic-rate-big {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: .2px;
  line-height: 1.1;
}
.ic-rate-unit {
  font-size: 11px;
  font-weight: 700;
  margin-left: 4px;
  opacity: .75;
}
.ic-set-big {
  font-size: 15px;
  font-weight: 900;
  line-height: 1.1;
  opacity: .9;
}
.ic-stock {
  font-size: 11px;
  color: #475569;
  font-weight: 700;
}
.ic-stock b { color: #0f172a; font-weight: 900; }
.ic-value {
  font-size: 15px;
  font-weight: 900;
  padding: 7px 8px;
  background: #ffffff;
  border: 2px solid;
  border-radius: 8px;
  margin-top: auto;
  letter-spacing: .2px;
}

/* Footer — sticks to bottom of poster */
.rk-foot {
  background: #0f172a;
  color: #cbd5e1;
  padding: 16px 40px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  border-top: 3px solid #facc15;
  margin-top: auto;
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
