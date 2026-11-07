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
  costIdr?: number | string;
  image?: File | null;
  imagePreview?: string;
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
  if (amount > 0 && amount < 0.01) return `$${amount.toPrecision(2)}`;
  return `$${amount.toFixed(2)}`;
}

function truncatePrice(price: number): number {
  if (price >= 0.01) return Math.floor(price * 100) / 100;
  return Math.floor(price * 100000) / 100000;
}

function costIdrToUsd(costIdr: number, rate: number, marginPct: number): number {
  if (!rate || !costIdr) return 0;
  return truncatePrice((costIdr / rate) * (1 + marginPct / 100) / (1 - 0.15));
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

.edo-tabs-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.edo-tabs { display: flex; gap: 6px; }
.edo-converter { display: flex; align-items: center; gap: 6px; margin-left: auto; font-size: 11px; color: var(--dim); }
.edo-converter input { width: 100px; padding: 6px 8px; font-size: 12px; background: var(--card); border: 1px solid #1e1e38; border-radius: 6px; color: var(--ink); font-family: var(--font-numbers, monospace); }
.edo-converter input:focus { border-color: var(--accent); outline: none; }
.edo-converter .edo-conv-label { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
.edo-converter .edo-conv-rate { font-size: 10px; color: var(--dim); opacity: .7; }
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

.edo-chip {
  padding: 4px 12px; font-size: 11px; font-weight: 700; border-radius: 16px;
  background: rgba(255,255,255,.06); color: var(--ink); border: 1px solid rgba(255,255,255,.12);
  cursor: pointer; transition: all .15s;
}
.edo-chip:hover { border-color: var(--accent); color: #fff; }
.edo-chip.active { background: var(--accent); color: #0b0b14; border-color: var(--accent); }

.edo-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.edo-table th {
  text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800;
  color: var(--dim); text-transform: uppercase; letter-spacing: .5px;
  border-bottom: 1px solid #1e1e38;
}
.edo-table td { padding: 10px 12px; font-size: 13px; color: var(--ink); border-bottom: 1px solid rgba(30,30,56,.5); }
.edo-table tr:hover td { background: var(--card-hover); }
.edo-img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--surface); border: 1px solid #222240; }
.edo-img-upload {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 8px; border: 1px dashed #444;
  background: var(--surface); cursor: pointer; overflow: hidden;
}
.edo-img-upload.lg { width: 100px; height: 100px; border-radius: 10px; }
.edo-img-upload:hover, .edo-img-upload.drag-over { border-color: var(--accent); background: rgba(139,92,246,.08); }
.edo-img-upload .edo-img { width: 100%; height: 100%; object-fit: cover; }

.edo-state { font-size: 12px; font-weight: 800; padding: 5px 12px; border-radius: 6px; letter-spacing: .5px; }
.edo-state.active, .edo-state.delivered { background: rgba(52,211,153,.12); color: var(--green); border: 1px solid rgba(52,211,153,.3); }
.edo-state.paused { background: rgba(251,191,36,.12); color: var(--gold); border: 1px solid rgba(251,191,36,.3); }
.edo-state.received { background: rgba(34,211,238,.12); color: var(--cyan); border: 1px solid rgba(34,211,238,.3); }
.edo-state.cancelled { background: rgba(239,68,68,.12); color: var(--red); border: 1px solid rgba(239,68,68,.3); }

.edo-actions { display: flex; gap: 4px; }

.edo-listing-cards { display: flex; flex-direction: column; gap: 10px; }
.edo-form-card.editing { border-color: var(--accent); }
.edo-img.lg { width: 80px; height: 80px; border-radius: 10px; }
.edo-form-cards { display: flex; flex-direction: column; gap: 12px; }
.edo-form-card {
  background: var(--card); border: 1px solid #1e1e38; border-radius: 12px; padding: 14px 16px;
}
.edo-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.edo-card-num { font-size: 11px; font-weight: 800; color: var(--dim); }
.edo-card-actions { display: flex; gap: 4px; }
.edo-card-body { display: flex; gap: 16px; }
.edo-card-left { flex-shrink: 0; }
.edo-card-right { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.edo-field { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.edo-field-row { display: flex; gap: 8px; }
.edo-label { font-size: 10px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
.edo-estimates { padding: 8px 12px; background: rgba(255,255,255,.03); border-radius: 8px; margin-top: 2px; }
.edo-est { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.edo-est-label { font-size: 10px; font-weight: 700; color: var(--dim); }
.edo-est-val { font-size: 13px; font-weight: 700; color: var(--ink); }
.edo-est-val.green { color: var(--green); }

.edo-input {
  width: 100%; padding: 8px 10px; border-radius: 7px; border: 1px solid #222240;
  background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 600; font-family: inherit;
  outline: none; transition: border .15s;
}
.edo-input:focus { border-color: var(--accent); }
.edo-textarea { resize: vertical; min-height: 60px; line-height: 1.5; }
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

.edo-folders { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.edo-folder {
  padding: 5px 12px; font-size: 11px; font-weight: 700; cursor: pointer;
  color: var(--dim); background: rgba(255,255,255,.04); border: 1px solid #1e1e38;
  border-radius: 8px; transition: all .15s; display: flex; align-items: center; gap: 4px;
}
.edo-folder:hover { border-color: var(--accent); color: var(--ink); }
.edo-folder.active { background: var(--accent); color: #0b0b14; border-color: var(--accent); }
.edo-folder .edo-folder-count { opacity: .6; font-size: 10px; }
.edo-folder-actions { display: none; gap: 2px; margin-left: 4px; }
.edo-folder:hover .edo-folder-actions { display: flex; }
.edo-folder-actions button { background: none; border: none; cursor: pointer; font-size: 10px; padding: 0 2px; color: inherit; opacity: .6; }
.edo-folder-actions button:hover { opacity: 1; }
.edo-folder-add { padding: 5px 10px; font-size: 13px; cursor: pointer; color: var(--dim); background: rgba(255,255,255,.04); border: 1px dashed #1e1e38; border-radius: 8px; }
.edo-folder-add:hover { border-color: var(--accent); color: var(--accent); }
.edo-folder-assign { font-size: 11px; padding: 3px 6px; background: var(--card); border: 1px solid #1e1e38; border-radius: 6px; color: var(--ink); cursor: pointer; }
.edo-folder-assign:focus { border-color: var(--accent); outline: none; }
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
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [convUsd, setConvUsd] = useState("");
  const [convIdr, setConvIdr] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [margin, setMargin] = useState(() => {
    try { return parseFloat(localStorage.getItem("edo-margin") || "50") || 50; } catch { return 50; }
  });

  const [folders, setFolders] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("edo-folders") || "[]"); } catch { return []; }
  });
  const [folderMap, setFolderMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("edo-folder-map") || "{}"); } catch { return {}; }
  });
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  function saveFolders(f: string[]) { setFolders(f); try { localStorage.setItem("edo-folders", JSON.stringify(f)); } catch {} }
  function saveFolderMap(m: Record<string, string>) { setFolderMap(m); try { localStorage.setItem("edo-folder-map", JSON.stringify(m)); } catch {} }

  function addFolder() {
    const name = prompt("Nama folder:");
    if (!name?.trim()) return;
    if (folders.includes(name.trim())) { alert("Folder sudah ada"); return; }
    saveFolders([...folders, name.trim()]);
  }
  function renameFolder(old: string) {
    const name = prompt("Rename folder:", old);
    if (!name?.trim() || name.trim() === old) return;
    const updated = folders.map((f) => f === old ? name.trim() : f);
    saveFolders(updated);
    const newMap = { ...folderMap };
    for (const [k, v] of Object.entries(newMap)) { if (v === old) newMap[k] = name.trim(); }
    saveFolderMap(newMap);
    if (activeFolder === old) setActiveFolder(name.trim());
  }
  function deleteFolder(name: string) {
    if (!confirm(`Hapus folder "${name}"?`)) return;
    saveFolders(folders.filter((f) => f !== name));
    const newMap = { ...folderMap };
    for (const [k, v] of Object.entries(newMap)) { if (v === name) delete newMap[k]; }
    saveFolderMap(newMap);
    if (activeFolder === name) setActiveFolder(null);
  }
  function assignFolder(offerId: string, folder: string | null) {
    const newMap = { ...folderMap };
    if (folder) newMap[offerId] = folder; else delete newMap[offerId];
    saveFolderMap(newMap);
  }

  const [market, setMarket] = useState<any[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketSort, setMarketSort] = useState("");
  const [marketGame, setMarketGame] = useState<"476" | "452">("476");
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

  const fetchMarket = useCallback(async (page = 1, search = "", sort = "", gameId = marketGame) => {
    setMarketLoading(true);
    setMarketError("");
    try {
      const qs = new URLSearchParams({ page: String(page), size: "24", gameId });
      if (search) qs.set("search", search);
      if (sort && !search) qs.set("sort", sort);
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
  }, [marketGame]);

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

  function startEdit(offer: Offer) {
    setEditId(offer.id);
    setEditData({
      title: offer.offerTitle || "",
      description: offer.description || "",
      price: offer.pricePerUnit?.amount || 0,
      quantity: offer.quantity || 1,
      minQuantity: offer.minQuantity || 1,
      deliveryTime: offer.guaranteedDeliveryTime || "Minute20",
      mainOfferImage: offer.mainOfferImage ? {
        smallImage: offer.mainOfferImage.smallImage || "",
        largeImage: offer.mainOfferImage.largeImage || "",
        originalSizeImage: (offer as any).mainOfferImage?.originalSizeImage || "",
      } : undefined,
    });
  }

  async function saveEdit() {
    if (!editId || !editData) return;
    setEditSaving(true);
    try {
      const payload = {
        action: "details",
        details: {
          offerTitle: editData.title,
          description: editData.description || "",
          guaranteedDeliveryTime: editData.deliveryTime || "Minute20",
          pricing: {
            quantity: editData.quantity ?? 1,
            pricePerUnit: { amount: truncatePrice(Number(editData.price)), currency: "USD" },
            volumeDiscounts: [],
          },
          offerImages: [],
          ...(editData.mainOfferImage ? { mainOfferImage: editData.mainOfferImage } : {}),
        },
        augmentedGame: {
          gameId: "476",
          category: "CustomItem",
          tradeEnvironmentId: null,
          offerAttributes: [],
        },
      };
      const res = await fetch(`/api/eldorado/offers/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditId(null);
        setEditData(null);
        fetchOffers();
      } else {
        const body = await res.json().catch(() => null);
        alert(`Edit gagal (${res.status}): ${JSON.stringify(body?.data || body?.error || "unknown")}`);
      }
    } catch (err: any) { alert(`Edit gagal: ${err.message}`); }
    finally { setEditSaving(false); }
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
    const valid = newItems.filter((i) => i.title.trim() && Number(i.price) > 0);
    if (valid.length === 0) { alert("Isi minimal 1 item dengan title dan price"); return; }
    setUploading(true);
    setUploadResults(null);
    try {
      const itemsWithImages = await Promise.all(
        valid.map(async (item) => {
          let mainOfferImage = undefined;
          if (item.image) {
            const form = new FormData();
            form.append("image", item.image);
            const imgRes = await fetch("/api/eldorado/upload-image", { method: "POST", body: form });
            if (imgRes.ok) {
              mainOfferImage = await imgRes.json();
            }
          }
          return { ...item, price: truncatePrice(Number(item.price)), mainOfferImage };
        })
      );
      const res = await fetch("/api/eldorado/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemsWithImages),
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
        <div className="edo-tabs-row">
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
          <div className="edo-converter">
            <div>
              <span className="edo-conv-label">USD</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={convUsd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                    setConvUsd(v);
                    setConvIdr(v && usdIdr ? Math.round(Number(v) * usdIdr).toLocaleString("id-ID") : "");
                  }
                }}
              />
            </div>
            <span style={{ fontSize: 14 }}>⇄</span>
            <div>
              <span className="edo-conv-label">IDR</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={convIdr}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\./g, "");
                  if (raw === "" || /^\d+$/.test(raw)) {
                    setConvIdr(raw ? Number(raw).toLocaleString("id-ID") : "");
                    setConvUsd(raw && usdIdr ? (Number(raw) / usdIdr).toFixed(2) : "");
                  }
                }}
              />
            </div>
            {usdIdr > 0 && <span className="edo-conv-rate">1 USD = {usdIdr.toLocaleString("id-ID")} IDR</span>}
          </div>
        </div>

        {/* Content box */}
        <div className="edo-content">
          {tab === "market" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button
                  className={`edo-tab${marketGame === "476" ? " active" : ""}`}
                  style={{ padding: "6px 16px", fontSize: 11 }}
                  onClick={() => { setMarketGame("476"); setMarketSearch(""); fetchMarket(1, "", marketSort, "476"); }}
                >
                  Anime Dice
                </button>
                <button
                  className={`edo-tab${marketGame === "452" ? " active" : ""}`}
                  style={{ padding: "6px 16px", fontSize: 11 }}
                  onClick={() => { setMarketGame("452"); setMarketSearch(""); fetchMarket(1, "", marketSort, "452"); }}
                >
                  Steal An Egg
                </button>
              </div>

              <div className="edo-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
                <input
                  className="edo-input"
                  placeholder="Cari item..."
                  value={marketSearch}
                  style={{ flex: 1, minWidth: 200 }}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") fetchMarket(1, marketSearch, marketSort); }}
                />
                <select
                  className="edo-select"
                  value={marketSort}
                  onChange={(e) => { setMarketSort(e.target.value); fetchMarket(1, marketSearch, e.target.value); }}
                >
                  <option value="">Default</option>
                  <option value="price_asc">Harga Terendah</option>
                  <option value="price_desc">Harga Tertinggi</option>
                </select>
                <button className="edo-btn" onClick={() => fetchMarket(1, marketSearch, marketSort)} disabled={marketLoading}>
                  {marketLoading ? "Loading..." : "🔍 Search"}
                </button>
                <div className="edo-toolbar-right">
                  <span className="edo-count">Hal {marketPage}/{marketTotalPages} — {marketTotal} listing</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(marketGame === "476"
                  ? ["Jackpot", "Gamepass", "Sp", "Sx", "Oc", "Qi", "Qd", "No", "Trait", "Gems", "Potion"]
                  : ["Sunlion", "Archangel", "1t", "Divine", "Speed", "Skywhale", "Spirit World Guardian", "Voidseer Pumpkin"]
                ).map((tag) => (
                  <button
                    key={tag}
                    className={`edo-chip${marketSearch.toLowerCase() === tag.toLowerCase() ? " active" : ""}`}
                    onClick={() => { const v = marketSearch.toLowerCase() === tag.toLowerCase() ? "" : tag; setMarketSearch(v); fetchMarket(1, v, marketSort); }}
                  >
                    {tag}
                  </button>
                ))}
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
                let display = [...market];
                if (marketSearch.trim()) {
                  const q = marketSearch.trim().toLowerCase();
                  display = display.filter((m: any) => (m.offer?.offerTitle || "").toLowerCase().includes(q));
                  if (marketSort === "price_asc") display.sort((a: any, b: any) => (a.offer?.pricePerUnitInUSD?.amount || 0) - (b.offer?.pricePerUnitInUSD?.amount || 0));
                  if (marketSort === "price_desc") display.sort((a: any, b: any) => (b.offer?.pricePerUnitInUSD?.amount || 0) - (a.offer?.pricePerUnitInUSD?.amount || 0));
                }
                if (display.length === 0) return (
                  <div className="edo-empty">
                    <div className="edo-empty-icon">🔍</div>
                    <div className="edo-empty-text">Tidak ada item &quot;{marketSearch}&quot; di halaman ini</div>
                    <div className="edo-empty-sub">Coba cari di halaman lain</div>
                  </div>
                );
                return (
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
                      {display.map((m: any) => {
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
                    <button className="edo-btn sm" disabled={marketPage <= 1} onClick={() => fetchMarket(marketPage - 1, marketSearch, marketSort)}>
                      ◀ Prev
                    </button>
                    <span style={{ color: "var(--dim)", fontSize: 12, lineHeight: "32px" }}>
                      {marketPage} / {marketTotalPages}
                    </span>
                    <button className="edo-btn sm" disabled={marketPage >= marketTotalPages} onClick={() => fetchMarket(marketPage + 1, marketSearch, marketSort)}>
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

              {folders.length > 0 && (
                <div className="edo-folders">
                  <button className={`edo-folder${activeFolder === null ? " active" : ""}`} onClick={() => setActiveFolder(null)}>
                    Semua <span className="edo-folder-count">({offers.length})</span>
                  </button>
                  {folders.map((f) => {
                    const count = offers.filter((o) => folderMap[o.id] === f).length;
                    return (
                      <button key={f} className={`edo-folder${activeFolder === f ? " active" : ""}`} onClick={() => setActiveFolder(activeFolder === f ? null : f)}>
                        {f} <span className="edo-folder-count">({count})</span>
                        <span className="edo-folder-actions">
                          <button onClick={(e) => { e.stopPropagation(); renameFolder(f); }} title="Rename">&#x270E;</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteFolder(f); }} title="Hapus">&#x2715;</button>
                        </span>
                      </button>
                    );
                  })}
                  {(() => {
                    const unassigned = offers.filter((o) => !folderMap[o.id]).length;
                    return unassigned > 0 && folders.length > 0 ? (
                      <button className={`edo-folder${activeFolder === "__none" ? " active" : ""}`} onClick={() => setActiveFolder(activeFolder === "__none" ? null : "__none")}>
                        Tanpa Folder <span className="edo-folder-count">({unassigned})</span>
                      </button>
                    ) : null;
                  })()}
                  <button className="edo-folder-add" onClick={addFolder} title="Tambah Folder">+</button>
                </div>
              )}
              {folders.length === 0 && offers.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <button className="edo-folder-add" onClick={addFolder} title="Tambah Folder">+ Tambah Folder</button>
                </div>
              )}

              {!loading && !error && offers.length === 0 && (
                <div className="edo-empty">
                  <div className="edo-empty-icon">&#x1F4E6;</div>
                  <div className="edo-empty-text">Belum ada listing</div>
                  <div className="edo-empty-sub">Buka tab UPLOAD untuk mulai jual item</div>
                </div>
              )}

              {offers.length > 0 && (
                <div className="edo-listing-cards">
                  {(activeFolder ? offers.filter((o) => activeFolder === "__none" ? !folderMap[o.id] : folderMap[o.id] === activeFolder) : offers).map((o) => {
                    const isEditing = editId === o.id && editData;
                    return (
                      <div key={o.id} className={`edo-form-card${isEditing ? " editing" : ""}`}>
                        <div className="edo-card-header">
                          <span className={`edo-state ${(o.offerState || "").toLowerCase() === "active" ? "active" : "paused"}`}>
                            {o.offerState || "?"}
                          </span>
                          {folders.length > 0 && (
                            <select
                              className="edo-folder-assign"
                              value={folderMap[o.id] || ""}
                              onChange={(e) => assignFolder(o.id, e.target.value || null)}
                            >
                              <option value="">— Tanpa Folder —</option>
                              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          )}
                          <div className="edo-card-actions">
                            {isEditing ? (
                              <>
                                <button className="edo-btn sm primary" onClick={saveEdit} disabled={editSaving}>
                                  {editSaving ? "..." : "Save"}
                                </button>
                                <button className="edo-btn sm" onClick={() => { setEditId(null); setEditData(null); }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button className="edo-btn sm" onClick={() => startEdit(o)} title="Edit">&#x270E;</button>
                                {(o.offerState || "").toLowerCase() === "active" ? (
                                  <button className="edo-btn sm" onClick={() => handleAction(o.id, "pause")} title="Pause">&#x23F8;</button>
                                ) : (
                                  <button className="edo-btn sm" onClick={() => handleAction(o.id, "resume")} title="Resume">&#x25B6;</button>
                                )}
                                <button className="edo-btn sm danger" onClick={() => handleDelete(o.id)} title="Hapus">&#x2715;</button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="edo-card-body">
                          <div className="edo-card-left">
                            {o.mainOfferImage?.smallImage ? (
                              <img className="edo-img lg" src={offerImgUrl(o.mainOfferImage.smallImage)} alt="" />
                            ) : (
                              <div className="edo-img lg" />
                            )}
                          </div>
                          <div className="edo-card-right">
                            {isEditing ? (
                              <>
                                <div className="edo-field">
                                  <label className="edo-label">Title</label>
                                  <input className="edo-input" value={editData.title} onChange={(e) => setEditData({ ...editData, title: e.target.value })} />
                                </div>
                                <div className="edo-field">
                                  <label className="edo-label">Description</label>
                                  <textarea className="edo-input edo-textarea" rows={3} value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} />
                                </div>
                                <div className="edo-field-row">
                                  <div className="edo-field">
                                    <label className="edo-label">Price (USD)</label>
                                    <input
                                      className="edo-input"
                                      type="text"
                                      inputMode="decimal"
                                      value={editData.price || ""}
                                      onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setEditData({ ...editData, price: v }); }}
                                      onBlur={(e) => setEditData({ ...editData, price: parseFloat(e.target.value) || 0 })}
                                    />
                                  </div>
                                  <div className="edo-field">
                                    <label className="edo-label">Qty</label>
                                    <input className="edo-input" type="number" min="1" value={editData.quantity} onChange={(e) => setEditData({ ...editData, quantity: parseInt(e.target.value) || 1 })} />
                                  </div>
                                  <div className="edo-field">
                                    <label className="edo-label">Delivery</label>
                                    <select className="edo-select" value={editData.deliveryTime} onChange={(e) => setEditData({ ...editData, deliveryTime: e.target.value })}>
                                      {DELIVERY_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="edo-field-row edo-estimates">
                                  <div className="edo-est">
                                    <span className="edo-est-label">Price IDR</span>
                                    <span className="edo-est-val">{Number(editData.price) && usdIdr ? fmtIdr(Number(editData.price) * usdIdr) : "-"}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Est. USD</span>
                                    <span className="edo-est-val green">{Number(editData.price) ? fmtUsd(Number(editData.price) * (1 - SALES_FEE)) : "-"}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Est. IDR</span>
                                    <span className="edo-est-val green">{Number(editData.price) && usdIdr ? fmtIdr(Number(editData.price) * usdIdr * (1 - SALES_FEE)) : "-"}</span>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{o.offerTitle || "-"}</div>
                                {o.description && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{o.description}</div>}
                                <div className="edo-field-row" style={{ marginTop: 6 }}>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Price USD</span>
                                    <span className="edo-est-val" style={{ color: "var(--gold)" }}>{fmtUsd(o.pricePerUnit?.amount)}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Qty</span>
                                    <span className="edo-est-val">{o.quantity ?? "-"}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Price IDR</span>
                                    <span className="edo-est-val">{usdIdr ? fmtIdr((o.pricePerUnit?.amount || 0) * usdIdr) : "-"}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Est. USD</span>
                                    <span className="edo-est-val green">{fmtUsd((o.pricePerUnit?.amount || 0) * (1 - SALES_FEE))}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Est. IDR</span>
                                    <span className="edo-est-val green">{usdIdr ? fmtIdr((o.pricePerUnit?.amount || 0) * usdIdr * (1 - SALES_FEE)) : "-"}</span>
                                  </div>
                                  <div className="edo-est">
                                    <span className="edo-est-label">Delivery</span>
                                    <span className="edo-est-val">{DELIVERY_OPTIONS.find((d) => d.value === o.guaranteedDeliveryTime)?.label || o.guaranteedDeliveryTime || "-"}</span>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                <button className="edo-btn" onClick={addRow}>+ Tambah Item</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 13, color: "var(--dim)" }}>Margin</label>
                  <input
                    className="edo-input"
                    type="number"
                    min="0"
                    style={{ width: 70, textAlign: "center" }}
                    value={margin}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setMargin(v);
                      try { localStorage.setItem("edo-margin", String(v)); } catch {}
                      if (usdIdr) {
                        setNewItems((prev) => prev.map((it) => {
                          const c = parseFloat(String(it.costIdr)) || 0;
                          if (!c) return it;
                          return { ...it, price: costIdrToUsd(c, usdIdr, v) };
                        }));
                      }
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--dim)" }}>%</span>
                </div>
                <button
                  className="edo-btn primary"
                  onClick={handleBulkUpload}
                  disabled={uploading || newItems.every((i) => !i.title.trim())}
                >
                  {uploading ? "Uploading..." : `Upload ${newItems.filter((i) => i.title.trim() && Number(i.price) > 0).length} Item`}
                </button>
              </div>

              <div className="edo-form-cards">
                {newItems.map((item, idx) => (
                  <div key={idx} className="edo-form-card">
                    <div className="edo-card-header">
                      <span className="edo-card-num">#{idx + 1}</span>
                      <div className="edo-card-actions">
                        <button className="edo-btn sm" onClick={() => duplicateRow(idx)} title="Duplicate">&#x29C9;</button>
                        {newItems.length > 1 && (
                          <button className="edo-btn sm danger" onClick={() => removeRow(idx)} title="Hapus">&#x2715;</button>
                        )}
                      </div>
                    </div>
                    <div className="edo-card-body">
                      <div className="edo-card-left">
                        <label
                          className="edo-img-upload lg"
                          title="Pilih atau drag gambar"
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                          onDragLeave={(e) => { e.currentTarget.classList.remove("drag-over"); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove("drag-over");
                            const f = e.dataTransfer.files?.[0];
                            if (!f || !f.type.startsWith("image/")) return;
                            const copy = [...newItems];
                            copy[idx] = { ...copy[idx], image: f, imagePreview: URL.createObjectURL(f) };
                            setNewItems(copy);
                          }}
                        >
                          {item.imagePreview ? (
                            <img src={item.imagePreview} alt="" className="edo-img" />
                          ) : (
                            <div style={{ textAlign: "center", color: "var(--dim)" }}>
                              <div style={{ fontSize: 24 }}>+</div>
                              <div style={{ fontSize: 10 }}>Drop / Klik</div>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const copy = [...newItems];
                              copy[idx] = { ...copy[idx], image: f, imagePreview: URL.createObjectURL(f) };
                              setNewItems(copy);
                            }}
                          />
                        </label>
                      </div>
                      <div className="edo-card-right">
                        <div className="edo-field">
                          <label className="edo-label">Title</label>
                          <input
                            className="edo-input"
                            placeholder="Nama item..."
                            value={item.title}
                            onChange={(e) => updateItem(idx, "title", e.target.value)}
                          />
                        </div>
                        <div className="edo-field">
                          <label className="edo-label">Description</label>
                          <textarea
                            className="edo-input edo-textarea"
                            rows={3}
                            placeholder="Deskripsi (opsional)"
                            value={item.description}
                            onChange={(e) => updateItem(idx, "description", e.target.value)}
                          />
                        </div>
                        <div className="edo-field-row">
                          <div className="edo-field">
                            <label className="edo-label">Harga Beli (IDR)</label>
                            <input
                              className="edo-input"
                              type="text"
                              inputMode="decimal"
                              placeholder="Rp modal..."
                              value={item.costIdr || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                  const copy = [...newItems];
                                  copy[idx] = { ...copy[idx], costIdr: v as any };
                                  if (v && usdIdr) {
                                    copy[idx].price = costIdrToUsd(parseFloat(v) || 0, usdIdr, margin);
                                  }
                                  setNewItems(copy);
                                }
                              }}
                            />
                          </div>
                          <div className="edo-field">
                            <label className="edo-label">Price (USD)</label>
                            <input
                              className="edo-input"
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={item.price || ""}
                              onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) updateItem(idx, "price", v as any); }}
                              onBlur={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <div className="edo-field">
                            <label className="edo-label">Qty</label>
                            <input
                              className="edo-input"
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                            />
                          </div>
                          <div className="edo-field">
                            <label className="edo-label">Min Qty</label>
                            <input
                              className="edo-input"
                              type="number"
                              min="1"
                              value={item.minQuantity}
                              onChange={(e) => updateItem(idx, "minQuantity", parseInt(e.target.value) || 1)}
                            />
                          </div>
                          <div className="edo-field">
                            <label className="edo-label">Delivery</label>
                            <select
                              className="edo-select"
                              value={item.deliveryTime}
                              onChange={(e) => updateItem(idx, "deliveryTime", e.target.value)}
                            >
                              {DELIVERY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="edo-field-row edo-estimates">
                          <div className="edo-est">
                            <span className="edo-est-label">Price IDR</span>
                            <span className="edo-est-val">{Number(item.price) && usdIdr ? fmtIdr(Number(item.price) * usdIdr) : "-"}</span>
                          </div>
                          <div className="edo-est">
                            <span className="edo-est-label">Est. USD</span>
                            <span className="edo-est-val green">{Number(item.price) ? fmtUsd(Number(item.price) * (1 - SALES_FEE)) : "-"}</span>
                          </div>
                          <div className="edo-est">
                            <span className="edo-est-label">Est. IDR</span>
                            <span className="edo-est-val green">{Number(item.price) && usdIdr ? fmtIdr(Number(item.price) * usdIdr * (1 - SALES_FEE)) : "-"}</span>
                          </div>
                          {Number(item.costIdr) > 0 && Number(item.price) > 0 && usdIdr > 0 && (() => {
                            const costIdr = parseFloat(String(item.costIdr)) || 0;
                            const estIdr = Number(item.price) * usdIdr * (1 - SALES_FEE);
                            const profit = estIdr - costIdr;
                            const profitPct = costIdr > 0 ? (profit / costIdr) * 100 : 0;
                            return (
                              <div className="edo-est">
                                <span className="edo-est-label">Profit</span>
                                <span className="edo-est-val" style={{ color: profit >= 0 ? "var(--green)" : "#ef4444" }}>
                                  {fmtIdr(profit)} ({profitPct >= 0 ? "+" : ""}{profitPct.toFixed(1)}%)
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {uploadResults && (
                <div className={`edo-result ${uploadResults.every((r) => r.ok) ? "success" : uploadResults.some((r) => r.ok) ? "mixed" : "error"}`}>
                  <strong>Hasil Upload:</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {uploadResults.map((r, i) => (
                      <li key={i}>
                        {r.ok ? "✓" : "✗"} {r.title} — {r.ok ? "Berhasil" : `Gagal (${r.status}): ${typeof r.data === "string" ? r.data : JSON.stringify(r.data)}`}
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
