"use client";

import { useEffect, useState, useCallback } from "react";

interface Offer {
  id: string;
  offerTitle?: string;
  description?: string;
  quantity?: number;
  minQuantity?: number;
  pricePerUnit?: { amount?: number; currency?: string };
  pricePerUnitInUSD?: { amount?: number; currency?: string };
  offerState?: string;
  guaranteedDeliveryTime?: string;
  createdAt?: string;
  mainOfferImage?: { smallImage?: string; largeImage?: string };
}

interface SoldOrder {
  id: string;
  buyerUsername?: string;
  purchaseQuantity?: number;
  totalPrice?: { amount?: number; currency?: string };
  state?: { state?: string; createdDate?: string };
  orderOfferDetails?: {
    offerTitle?: string;
    category?: string;
    mainOfferImage?: { smallImage?: string; largeImage?: string };
    guaranteedDeliveryTime?: string;
  };
}

interface NewItem {
  title: string;
  description: string;
  price: number;
  quantity: number;
  minQuantity: number;
  deliveryTime: string;
}

const ELDORADO_CDN = "https://assetsdelivery.eldorado.gg/v7/_offers-v2_/";

function offerImgUrl(filename?: string) {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;
  return `${ELDORADO_CDN}${filename}`;
}

const DELIVERY_OPTIONS = [
  { value: "Instant", label: "Instant" },
  { value: "Minute5", label: "5 min" },
  { value: "Minute20", label: "20 min" },
  { value: "Hour1", label: "1 jam" },
  { value: "Hour2", label: "2 jam" },
  { value: "Hour5", label: "5 jam" },
  { value: "Hour12", label: "12 jam" },
  { value: "Day1", label: "1 hari" },
  { value: "Day3", label: "3 hari" },
  { value: "Day7", label: "7 hari" },
];

const emptyItem = (): NewItem => ({
  title: "",
  description: "",
  price: 0,
  quantity: 1,
  minQuantity: 1,
  deliveryTime: "Minute20",
});

function fmtUsd(amount?: number) {
  if (amount == null) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function fmtIdr(amount?: number) {
  if (amount == null) return "Rp 0";
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

const styles = `
:root {
  --bg: #0b0b14; --surface: #111120; --card: #15152a; --card-hover: #1a1a35;
  --ink: #e8e8f0; --dim: #555570; --accent: #818cf8; --accent2: #a855f7;
  --green: #34d399; --gold: #fbbf24; --red: #ef4444; --cyan: #22d3ee; --purple: #c084fc;
}

.edo-wrap { max-width: 1600px; margin: 0 auto; padding: 20px 24px 40px; font-family: 'Inter', system-ui, sans-serif; }

.edo-topbar { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.edo-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; flex: 1; min-width: 0; }
.edo-stat { background: var(--card); border: 1px solid #1e1e38; border-radius: 12px; padding: 14px 18px; text-align: left; }
.edo-stat.wallet { border-color: rgba(251,191,36,.2); background: linear-gradient(135deg, rgba(251,191,36,.04), transparent), var(--card); }
.edo-stat.estimasi { border-color: rgba(52,211,153,.25); background: linear-gradient(135deg, rgba(52,211,153,.04), transparent), var(--card); }
.edo-stat.withdrawn { border-color: rgba(129,140,248,.2); background: linear-gradient(135deg, rgba(129,140,248,.04), transparent), var(--card); }
.edo-stat.income { border-color: rgba(34,211,238,.2); background: linear-gradient(135deg, rgba(34,211,238,.04), transparent), var(--card); }
.edo-stat-label { font-size: 10px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.edo-stat-value { font-size: 20px; font-weight: 900; color: var(--ink); }
.edo-stat.wallet .edo-stat-value { color: var(--gold); }
.edo-stat.estimasi .edo-stat-value { color: var(--green); }
.edo-stat.withdrawn .edo-stat-value { color: var(--accent); }
.edo-stat.income .edo-stat-value { color: var(--cyan); }

.edo-tabs { display: flex; gap: 6px; margin-bottom: 20px; }
.edo-tab {
  padding: 10px 22px; font-size: 12px; font-weight: 800; cursor: pointer;
  color: var(--dim); background: var(--card); border: 1px solid #1e1e38;
  border-radius: 10px; transition: all .15s; letter-spacing: .5px;
}
.edo-tab:hover { color: var(--ink); border-color: var(--accent); }
.edo-tab.active { background: var(--accent); color: #0b0b14; border-color: var(--accent); }

.edo-content { background: var(--card); border: 1px solid #1e1e38; border-radius: 14px; padding: 18px; min-height: 400px; }

.edo-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.edo-toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.edo-btn {
  background: var(--surface); border: 1px solid #222240; color: var(--ink);
  font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 8px;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.edo-btn:hover { border-color: var(--accent); }
.edo-btn.primary { background: var(--accent); color: #0b0b14; border-color: var(--accent); }
.edo-btn.primary:hover { background: #6366f1; }
.edo-btn.danger { background: rgba(239,68,68,.12); color: var(--red); border: 1px solid rgba(239,68,68,.3); }
.edo-btn.danger:hover { background: rgba(239,68,68,.2); }
.edo-btn.sm { padding: 5px 10px; font-size: 11px; }
.edo-btn:disabled { opacity: .5; cursor: not-allowed; }

.edo-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.edo-table th {
  text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800;
  color: var(--dim); text-transform: uppercase; letter-spacing: .5px;
  border-bottom: 1px solid #1e1e38;
}
.edo-table td { padding: 10px 12px; font-size: 13px; color: var(--ink); border-bottom: 1px solid rgba(30,30,56,.5); }
.edo-table tr:hover td { background: var(--card-hover); }
.edo-img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--surface); border: 1px solid #222240; }

.edo-state { font-size: 12px; font-weight: 800; padding: 5px 12px; border-radius: 6px; letter-spacing: .5px; }
.edo-state.active, .edo-state.delivered { background: rgba(52,211,153,.12); color: var(--green); border: 1px solid rgba(52,211,153,.3); }
.edo-state.paused { background: rgba(251,191,36,.12); color: var(--gold); border: 1px solid rgba(251,191,36,.3); }
.edo-state.received { background: rgba(34,211,238,.12); color: var(--cyan); border: 1px solid rgba(34,211,238,.3); }
.edo-state.cancelled { background: rgba(239,68,68,.12); color: var(--red); border: 1px solid rgba(239,68,68,.3); }

.edo-actions { display: flex; gap: 4px; }

.edo-form-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.edo-form-table th {
  text-align: left; padding: 8px 8px; font-size: 10px; font-weight: 800;
  color: var(--dim); text-transform: uppercase; letter-spacing: .5px;
  border-bottom: 1px solid #1e1e38; position: sticky; top: 0; background: var(--card); z-index: 1;
}
.edo-form-table td { padding: 4px 4px; vertical-align: top; }
.edo-input {
  width: 100%; padding: 8px 10px; border-radius: 7px; border: 1px solid #222240;
  background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 600; font-family: inherit;
  outline: none; transition: border .15s;
}
.edo-input:focus { border-color: var(--accent); }
.edo-input.sm { width: 80px; }
.edo-select {
  padding: 8px 10px; border-radius: 7px; border: 1px solid #222240;
  background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 600; font-family: inherit;
  outline: none; cursor: pointer;
}
.edo-select:focus { border-color: var(--accent); }

.edo-result { margin-top: 12px; padding: 12px 16px; border-radius: 10px; font-size: 12px; font-weight: 600; border: 1px solid; }
.edo-result.success { background: rgba(52,211,153,.08); color: var(--green); border-color: rgba(52,211,153,.3); }
.edo-result.error { background: rgba(239,68,68,.08); color: var(--red); border-color: rgba(239,68,68,.3); }
.edo-result.mixed { background: rgba(251,191,36,.08); color: var(--gold); border-color: rgba(251,191,36,.3); }

.edo-empty { text-align: center; padding: 60px 20px; color: var(--dim); }
.edo-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: .5; }
.edo-empty-text { font-size: 14px; font-weight: 700; color: var(--ink); }
.edo-empty-sub { font-size: 12px; color: var(--dim); margin-top: 4px; }

.edo-row-num { font-size: 11px; color: var(--dim); font-weight: 700; text-align: center; width: 32px; }
.edo-count { font-size: 12px; color: var(--dim); font-weight: 700; }
`;

export default function EldoradoPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orders, setOrders] = useState<SoldOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [tab, setTab] = useState<"market" | "list" | "create" | "orders">("market");

  const [newItems, setNewItems] = useState<NewItem[]>([emptyItem()]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any[] | null>(null);
  const [usdIdr, setUsdIdr] = useState(0);

  const [market, setMarket] = useState<any[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketSort, setMarketSort] = useState("");
  const [marketPage, setMarketPage] = useState(1);
  const [marketTotal, setMarketTotal] = useState(0);
  const [marketTotalPages, setMarketTotalPages] = useState(0);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/eldorado/offers");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = data.items || data.results || data || [];
      setOffers(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const res = await fetch("/api/eldorado/orders");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = data.results || data || [];
      setOrders(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setOrdersError(e.message);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const fetchMarket = useCallback(async (page = 1) => {
    setMarketLoading(true);
    setMarketError("");
    try {
      const qs = new URLSearchParams({ page: String(page), size: "24" });
      const res = await fetch(`/api/eldorado/market?${qs}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMarket(data.results || []);
      setMarketTotal(data.recordCount || 0);
      setMarketTotalPages(data.totalPages || 0);
      setMarketPage(page);
    } catch (e: any) {
      setMarketError(e.message);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); fetchOrders(); fetchMarket(); }, [fetchOffers, fetchOrders, fetchMarket]);

  useEffect(() => {
    const id = setInterval(() => { fetchOffers(); fetchOrders(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchOffers, fetchOrders]);

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((d) => setUsdIdr(d.rates?.IDR || 0))
      .catch(() => {});
  }, []);

  const activeOffers = offers.filter((o) => (o.offerState || "").toLowerCase() === "active");
  const completedOrders = orders.filter((o) => {
    const s = (o.state?.state || "").toLowerCase();
    return s === "received" || s === "delivered";
  });
  const totalSold = completedOrders.reduce((sum, o) => sum + (o.totalPrice?.amount || 0), 0);
  const SALES_FEE = 0.15;
  const WD_FEE_PCT = 0.04;
  const WD_FEE_FLAT = 2;
  const BANK_FEE_PCT = 0.02;
  const BANK_FEE_FLAT = 1.5;
  const afterSalesFee = totalSold * (1 - SALES_FEE);
  const afterWdFee = Math.max(afterSalesFee * (1 - WD_FEE_PCT) - WD_FEE_FLAT, 0);
  const income = Math.max(afterWdFee * (1 - BANK_FEE_PCT) - BANK_FEE_FLAT, 0);

  async function handleAction(offerId: string, action: string) {
    try {
      const res = await fetch(`/api/eldorado/offers/${offerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchOffers();
      else alert("Action failed");
    } catch { alert("Action failed"); }
  }

  async function handleDelete(offerId: string) {
    if (!confirm("Hapus listing ini?")) return;
    try {
      const res = await fetch(`/api/eldorado/offers/${offerId}`, { method: "DELETE" });
      if (res.ok) fetchOffers();
      else alert("Delete failed");
    } catch { alert("Delete failed"); }
  }

  function updateItem(idx: number, field: keyof NewItem, value: any) {
    setNewItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function addRow() { setNewItems((prev) => [...prev, emptyItem()]); }
  function removeRow(idx: number) { setNewItems((prev) => prev.filter((_, i) => i !== idx)); }
  function duplicateRow(idx: number) {
    setNewItems((prev) => {
      const copy = { ...prev[idx] };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }

  async function handleBulkUpload() {
    const valid = newItems.filter((i) => i.title.trim() && i.price > 0);
    if (valid.length === 0) { alert("Isi minimal 1 item dengan title dan price"); return; }
    setUploading(true);
    setUploadResults(null);
    try {
      const res = await fetch("/api/eldorado/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const data = await res.json();
      setUploadResults(data.results || []);
      if (data.results?.every((r: any) => r.ok)) {
        setNewItems([emptyItem()]);
        fetchOffers();
      }
    } catch (e: any) {
      alert("Upload error: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <style>{styles}</style>

      <div className="edo-wrap">
        {/* Top stats */}
        <div className="edo-topbar">
          <div className="edo-stats">
            <div className="edo-stat wallet">
              <div className="edo-stat-label">WALLET</div>
              <div className="edo-stat-value">{fmtUsd(totalSold)}</div>
            </div>
            <div className="edo-stat withdrawn">
              <div className="edo-stat-label">WITHDRAWAL</div>
              <div className="edo-stat-value">{fmtUsd(afterSalesFee)}</div>
            </div>
            <div className="edo-stat estimasi">
              <div className="edo-stat-label">ESTIMASI</div>
              <div className="edo-stat-value">{fmtUsd(afterWdFee)}</div>
            </div>
            <div className="edo-stat income">
              <div className="edo-stat-label">INCOME</div>
              <div className="edo-stat-value">{fmtUsd(income)}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="edo-tabs">
          <button className={`edo-tab ${tab === "market" ? "active" : ""}`} onClick={() => setTab("market")}>
            PRICE GLOBAL ({marketTotal})
          </button>
          <button className={`edo-tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
            LISTING ({offers.length})
          </button>
          <button className={`edo-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
            SOLD ORDERS ({orders.length})
          </button>
          <button className={`edo-tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
            UPLOAD
          </button>
        </div>

        {/* Content box */}
        <div className="edo-content">
          {tab === "market" && (
            <>
              <div className="edo-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
                <input
                  className="edo-input"
                  placeholder="Cari item..."
                  value={marketSearch}
                  style={{ flex: 1, minWidth: 200 }}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") fetchMarket(1); }}
                />
                <select
                  className="edo-select"
                  value={marketSort}
                  onChange={(e) => setMarketSort(e.target.value)}
                >
                  <option value="">Default</option>
                  <option value="price_asc">Harga Terendah</option>
                  <option value="price_desc">Harga Tertinggi</option>
                </select>
                <button className="edo-btn" onClick={() => fetchMarket(1)} disabled={marketLoading}>
                  {marketLoading ? "Loading..." : "🔍 Search"}
                </button>
                <div className="edo-toolbar-right">
                  <span className="edo-count">Hal {marketPage}/{marketTotalPages} — {marketTotal} listing</span>
                </div>
              </div>

              {marketError && <div className="edo-result error">{marketError}</div>}

              {!marketLoading && !marketError && market.length === 0 && (
                <div className="edo-empty">
                  <div className="edo-empty-icon">🌐</div>
                  <div className="edo-empty-text">Tidak ada listing ditemukan</div>
                  <div className="edo-empty-sub">Coba search dengan kata kunci lain</div>
                </div>
              )}

              {market.length > 0 && (() => {
                const filtered = market.filter((m: any) => {
                  if (!marketSearch.trim()) return true;
                  const title = (m.offer?.offerTitle || "").toLowerCase();
                  return marketSearch.trim().toLowerCase().split(/\s+/).every((w: string) => title.includes(w));
                });
                if (marketSort === "price_asc") filtered.sort((a: any, b: any) => (a.offer?.pricePerUnitInUSD?.amount || 0) - (b.offer?.pricePerUnitInUSD?.amount || 0));
                if (marketSort === "price_desc") filtered.sort((a: any, b: any) => (b.offer?.pricePerUnitInUSD?.amount || 0) - (a.offer?.pricePerUnitInUSD?.amount || 0));
                return filtered.length === 0 ? (
                  <div className="edo-empty">
                    <div className="edo-empty-icon">🔍</div>
                    <div className="edo-empty-text">Tidak ada item cocok dengan &quot;{marketSearch}&quot;</div>
                    <div className="edo-empty-sub">Filter diterapkan pada {market.length} listing di halaman ini</div>
                  </div>
                ) : (
                <>
                  <table className="edo-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Title</th>
                        <th>Seller</th>
                        <th>Qty</th>
                        <th>Min</th>
                        <th>Price USD</th>
                        <th>Price IDR</th>
                        <th>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m: any) => {
                        const o = m.offer || {};
                        const u = m.user || {};
                        const dt = m.deliveryTime || {};
                        const priceUsd = o.pricePerUnitInUSD?.amount || o.pricePerUnit?.amount || 0;
                        const img = o.mainOfferImage?.smallImage;
                        const median = dt.deliveryTimeMedian;
                        const medianMin = median ? Math.round(parseFloat(median.split(":")[1]) + parseFloat(median.split(":")[0]) * 60) : null;
                        return (
                          <tr key={o.id}>
                            <td>
                              {img ? (
                                <img className="edo-img" src={offerImgUrl(img)} alt="" />
                              ) : (
                                <div className="edo-img" />
                              )}
                            </td>
                            <td style={{ fontWeight: 700, maxWidth: 300 }}>{o.offerTitle || "-"}</td>
                            <td style={{ fontSize: 12 }}>
                              <span style={{ color: u.isVerifiedSeller ? "var(--green)" : "var(--ink)" }}>
                                {u.isVerifiedSeller ? "✓ " : ""}{u.username || "-"}
                              </span>
                            </td>
                            <td>{o.quantity ?? "-"}</td>
                            <td>{o.minQuantity ?? "-"}</td>
                            <td style={{ fontWeight: 800, color: "var(--gold)" }}>{fmtUsd(priceUsd)}</td>
                            <td style={{ fontWeight: 700, color: "var(--ink)", fontSize: 12 }}>
                              {usdIdr ? fmtIdr(priceUsd * usdIdr) : "-"}
                            </td>
                            <td style={{ fontSize: 11, color: "var(--dim)", whiteSpace: "nowrap" }}>
                              {medianMin != null ? `~${medianMin}m` : o.guaranteedDeliveryTime || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
                    <button className="edo-btn sm" disabled={marketPage <= 1} onClick={() => fetchMarket(marketPage - 1)}>
                      ◀ Prev
                    </button>
                    <span style={{ color: "var(--dim)", fontSize: 12, lineHeight: "32px" }}>
                      {marketPage} / {marketTotalPages}
                    </span>
                    <button className="edo-btn sm" disabled={marketPage >= marketTotalPages} onClick={() => fetchMarket(marketPage + 1)}>
                      Next ▶
                    </button>
                  </div>
                </>
                ); })()}
            </>
          )}

          {tab === "list" && (
            <>
              <div className="edo-toolbar">
                <button className="edo-btn" onClick={fetchOffers} disabled={loading}>
                  {loading ? "Loading..." : "↻ Refresh List"}
                </button>
                <div className="edo-toolbar-right">
                  <span className="edo-count">{activeOffers.length} active / {offers.length} total</span>
                </div>
              </div>

              {error && <div className="edo-result error">{error}</div>}

              {!loading && !error && offers.length === 0 && (
                <div className="edo-empty">
                  <div className="edo-empty-icon">&#x1F4E6;</div>
                  <div className="edo-empty-text">Belum ada listing</div>
                  <div className="edo-empty-sub">Buka tab UPLOAD untuk mulai jual item</div>
                </div>
              )}

              {offers.length > 0 && (
                <table className="edo-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Title</th>
                      <th>Qty</th>
                      <th>Min</th>
                      <th>Price USD</th>
                      <th>Price IDR</th>
                      <th>Estimasi USD</th>
                      <th>Estimasi IDR</th>
                      <th>Delivery</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => (
                      <tr key={o.id}>
                        <td>
                          {o.mainOfferImage?.smallImage ? (
                            <img className="edo-img" src={offerImgUrl(o.mainOfferImage.smallImage)} alt="" />
                          ) : (
                            <div className="edo-img" />
                          )}
                        </td>
                        <td style={{ fontWeight: 700, maxWidth: 300 }}>{o.offerTitle || "-"}</td>
                        <td>{o.quantity ?? "-"}</td>
                        <td>{o.minQuantity ?? "-"}</td>
                        <td style={{ fontWeight: 800, color: "var(--gold)" }}>
                          {fmtUsd(o.pricePerUnit?.amount)}
                        </td>
                        <td style={{ fontWeight: 700, color: "var(--ink)", fontSize: 12 }}>
                          {usdIdr ? fmtIdr((o.pricePerUnit?.amount || 0) * usdIdr) : "-"}
                        </td>
                        <td style={{ fontWeight: 700, color: "var(--green)", fontSize: 12 }}>
                          {fmtUsd((o.pricePerUnit?.amount || 0) * (o.minQuantity || 1) * (1 - SALES_FEE))}
                        </td>
                        <td style={{ fontWeight: 700, color: "var(--green)", fontSize: 12 }}>
                          {usdIdr ? fmtIdr((o.pricePerUnit?.amount || 0) * (o.minQuantity || 1) * (1 - SALES_FEE) * usdIdr) : "-"}
                        </td>
                        <td style={{ fontSize: 11, color: "var(--dim)" }}>{o.guaranteedDeliveryTime || "-"}</td>
                        <td>
                          <span className={`edo-state ${(o.offerState || "").toLowerCase() === "active" ? "active" : "paused"}`}>
                            {o.offerState || "?"}
                          </span>
                        </td>
                        <td>
                          <div className="edo-actions">
                            {(o.offerState || "").toLowerCase() === "active" ? (
                              <button className="edo-btn sm" onClick={() => handleAction(o.id, "pause")} title="Pause">&#x23F8;</button>
                            ) : (
                              <button className="edo-btn sm" onClick={() => handleAction(o.id, "resume")} title="Resume">&#x25B6;</button>
                            )}
                            <button className="edo-btn sm danger" onClick={() => handleDelete(o.id)} title="Hapus">&#x2715;</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === "orders" && (
            <>
              <div className="edo-toolbar">
                <button className="edo-btn" onClick={fetchOrders} disabled={ordersLoading}>
                  {ordersLoading ? "Loading..." : "↻ Refresh"}
                </button>
                <div className="edo-toolbar-right">
                  <span className="edo-count">{completedOrders.length} completed / {orders.length} total</span>
                </div>
              </div>

              {ordersError && <div className="edo-result error">{ordersError}</div>}

              {!ordersLoading && !ordersError && orders.length === 0 && (
                <div className="edo-empty">
                  <div className="edo-empty-icon">&#x1F4B0;</div>
                  <div className="edo-empty-text">Belum ada sold orders</div>
                  <div className="edo-empty-sub">Sold orders akan muncul di sini setelah ada pembeli</div>
                </div>
              )}

              {orders.length > 0 && (
                <table className="edo-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Order</th>
                      <th>Buyer</th>
                      <th>Qty</th>
                      <th>Price USD</th>
                      <th>Price IDR</th>
                      <th>Estimasi USD</th>
                      <th>Estimasi IDR</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const st = (o.state?.state || "").toLowerCase();
                      const stClass = st === "received" ? "received" : st === "delivered" ? "delivered" : st === "cancelled" ? "cancelled" : "paused";
                      const img = o.orderOfferDetails?.mainOfferImage?.smallImage;
                      const date = o.state?.createdDate ? new Date(o.state.createdDate).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
                      return (
                        <tr key={o.id}>
                          <td>
                            {img ? (
                              <img className="edo-img" src={offerImgUrl(img)} alt="" />
                            ) : (
                              <div className="edo-img" />
                            )}
                          </td>
                          <td style={{ fontWeight: 700, maxWidth: 300 }}>{o.orderOfferDetails?.offerTitle || "-"}</td>
                          <td style={{ fontSize: 13, color: "var(--ink)" }}>{o.buyerUsername || "-"}</td>
                          <td>{o.purchaseQuantity ?? "-"}</td>
                          <td style={{ fontWeight: 800, color: "var(--gold)" }}>
                            {fmtUsd(o.totalPrice?.amount)}
                          </td>
                          <td style={{ fontWeight: 700, color: "var(--ink)", fontSize: 12 }}>
                            {usdIdr ? fmtIdr((o.totalPrice?.amount || 0) * usdIdr) : "-"}
                          </td>
                          <td style={{ fontWeight: 700, color: "var(--green)", fontSize: 12 }}>
                            {fmtUsd((o.totalPrice?.amount || 0) * (1 - SALES_FEE))}
                          </td>
                          <td style={{ fontWeight: 700, color: "var(--green)", fontSize: 12 }}>
                            {usdIdr ? fmtIdr((o.totalPrice?.amount || 0) * (1 - SALES_FEE) * usdIdr) : "-"}
                          </td>
                          <td>
                            <span className={`edo-state ${stClass}`}>
                              {o.state?.state || "?"}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap" }}>{date}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === "create" && (
            <>
              <div className="edo-toolbar">
                <button className="edo-btn" onClick={addRow}>+ Tambah Row</button>
                <button
                  className="edo-btn primary"
                  onClick={handleBulkUpload}
                  disabled={uploading || newItems.every((i) => !i.title.trim())}
                >
                  {uploading ? "Uploading..." : `Upload ${newItems.filter((i) => i.title.trim() && i.price > 0).length} Item`}
                </button>
                <div className="edo-toolbar-right">
                  <span className="edo-count">{newItems.length} row</span>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="edo-form-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={{ minWidth: 250 }}>Title</th>
                      <th style={{ minWidth: 200 }}>Description</th>
                      <th style={{ width: 80 }}>Price ($)</th>
                      <th style={{ width: 100 }}>Price IDR</th>
                      <th style={{ width: 60 }}>Qty</th>
                      <th style={{ width: 60 }}>Min Qty</th>
                      <th style={{ width: 90 }}>Estimasi</th>
                      <th style={{ width: 100 }}>Delivery</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="edo-row-num">{idx + 1}</td>
                        <td>
                          <input
                            className="edo-input"
                            placeholder="Nama item..."
                            value={item.title}
                            onChange={(e) => updateItem(idx, "title", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="edo-input"
                            placeholder="Deskripsi (opsional)"
                            value={item.description}
                            onChange={(e) => updateItem(idx, "description", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="edo-input sm"
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.price || ""}
                            onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td style={{ fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap" }}>
                          {item.price && usdIdr ? fmtIdr(item.price * usdIdr) : "-"}
                        </td>
                        <td>
                          <input
                            className="edo-input sm"
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          />
                        </td>
                        <td>
                          <input
                            className="edo-input sm"
                            type="number"
                            min="1"
                            value={item.minQuantity}
                            onChange={(e) => updateItem(idx, "minQuantity", parseInt(e.target.value) || 1)}
                          />
                        </td>
                        <td style={{ fontSize: 12, color: "var(--green)", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {item.price ? fmtUsd(item.price * item.minQuantity * (1 - SALES_FEE)) : "-"}
                        </td>
                        <td>
                          <select
                            className="edo-select"
                            value={item.deliveryTime}
                            onChange={(e) => updateItem(idx, "deliveryTime", e.target.value)}
                          >
                            {DELIVERY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="edo-actions">
                            <button className="edo-btn sm" onClick={() => duplicateRow(idx)} title="Duplicate">&#x29C9;</button>
                            {newItems.length > 1 && (
                              <button className="edo-btn sm danger" onClick={() => removeRow(idx)} title="Hapus">&#x2715;</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {uploadResults && (
                <div className={`edo-result ${uploadResults.every((r) => r.ok) ? "success" : uploadResults.some((r) => r.ok) ? "mixed" : "error"}`}>
                  <strong>Hasil Upload:</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {uploadResults.map((r, i) => (
                      <li key={i}>
                        {r.ok ? "✓" : "✗"} {r.title} — {r.ok ? "Berhasil" : `Gagal (${r.status})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
